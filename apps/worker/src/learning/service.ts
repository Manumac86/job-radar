// Learning from triage decisions (offer-feedback spec, design D4–D7).
import {
  LlmCapReachedError,
  LlmUnavailableError,
  SALARY_LOOKBACK_DAYS,
  learnPreferences,
  rateSuggestions,
  type CurrentPreference,
  type FeedbackItem,
  type LlmBudget,
  type LlmClient,
} from "@job-radar/core";
import {
  countPendingDismissals,
  countPendingFeedback,
  createLearnedPreference,
  listLearnedPreferences,
  markFeedbackLearned,
  pendingFeedback,
  positiveSignals,
  removeLearnedByRun,
  salaryDismissals,
  supersedeSuggestions,
  updateLearnedByRun,
  updateLearningState,
  upsertSuggestion,
  type Db,
  type FeedbackWithOffer,
} from "@job-radar/db";
import PQueue from "p-queue";
import { errorMessage, log } from "../log";
import type { Notifier } from "../notifier";
import type { ProfileService } from "../profile-service";

/** Learnable dismissals that start a run without waiting for the daily one. */
export const LEARNING_THRESHOLD = 5;

export type LearningTrigger = "manual" | "threshold" | "daily";

export type LearningRunResult =
  | {
      ran: true;
      added: string[];
      updated: number;
      retired: number;
      dropped: number;
      feedbackUsed: number;
    }
  | { ran: false; reason: string };

export class LearningError extends Error {
  override readonly name = "LearningError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function toItem(f: FeedbackWithOffer): FeedbackItem {
  return {
    offerId: f.offerId,
    kind: f.kind,
    reasons: f.reasons,
    note: f.note,
    offer: {
      title: f.title,
      companyName: f.companyName,
      location: f.location,
      remotePolicy: f.remotePolicy,
      regions: f.regions,
      engagementType: f.engagementType,
      compensation:
        f.compMin === null && f.compMax === null
          ? null
          : { min: f.compMin, max: f.compMax, currency: f.compCurrency, period: f.compPeriod },
      skills: f.skills,
      description: f.description,
    },
  };
}

export class LearningService {
  private readonly queue = new PQueue({ concurrency: 1 });

  constructor(
    private readonly deps: {
      db: Db;
      profile: ProfileService;
      client: LlmClient;
      budget: LlmBudget;
      notifier?: Notifier;
      now?: () => Date;
    },
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Called after each triage change from the web: suggestions now, learning at the threshold. */
  async feedbackAdded(): Promise<LearningRunResult | null> {
    this.refreshSuggestions();
    if (countPendingDismissals(this.deps.db) < LEARNING_THRESHOLD) return null;
    return this.run("threshold").catch((err: unknown) => {
      log.warn("learning run skipped", { error: errorMessage(err) });
      return null;
    });
  }

  /** Daily run when any new feedback exists. */
  async daily(): Promise<LearningRunResult | null> {
    if (!countPendingFeedback(this.deps.db)) return null;
    return this.run("daily").catch((err: unknown) => {
      log.warn("daily learning run skipped", { error: errorMessage(err) });
      return null;
    });
  }

  run(trigger: LearningTrigger): Promise<LearningRunResult> {
    return this.queue.add(() => this.runNow(trigger));
  }

  private async runNow(trigger: LearningTrigger): Promise<LearningRunResult> {
    const { db } = this.deps;
    const feedback = pendingFeedback(db);
    if (!feedback.length) return { ran: false, reason: "Nothing new to learn from" };
    if (trigger === "threshold" && countPendingDismissals(db) < LEARNING_THRESHOLD) {
      return { ran: false, reason: "Below the threshold" };
    }
    const profile = this.deps.profile.get();
    if (!profile) throw new LearningError("Profile is invalid; fix it in Settings first", 409);
    if (this.deps.budget.remaining("extraction") <= 0) {
      return { ran: false, reason: "Daily scoring cap reached; learning waits until tomorrow" };
    }
    const sent = new Set(feedback.map((f) => f.id));
    const positives = positiveSignals(db).filter((f) => !sent.has(f.id));
    const current: CurrentPreference[] = listLearnedPreferences(db, { includeDeleted: true });
    let result;
    try {
      result = await learnPreferences(
        { client: this.deps.client, budget: this.deps.budget },
        {
          model: profile.preferences.scoring.models.drafting,
          current,
          feedback: feedback.map(toItem),
          positives: positives.map(toItem),
        },
      );
    } catch (err) {
      if (err instanceof LlmCapReachedError) {
        return { ran: false, reason: "Daily scoring cap reached; learning waits until tomorrow" };
      }
      if (err instanceof LlmUnavailableError) throw new LearningError(err.message, 503);
      throw new LearningError(`Learning failed: ${errorMessage(err)}`, 502);
    }
    const { plan } = result;
    const now = this.now();
    let changed = 0;
    db.transaction(() => {
      for (const id of plan.retire) if (removeLearnedByRun(db, id)) changed++;
      for (const u of plan.update) {
        if (updateLearnedByRun(db, u.id, { text: u.text, evidence: u.evidence })) changed++;
      }
      for (const a of plan.add) {
        createLearnedPreference(db, { ...a, origin: "learned" });
        changed++;
      }
      markFeedbackLearned(db, [...sent], now);
    });
    updateLearningState(db, {
      lastRunAt: now.getTime(),
      ...(changed ? { changedAt: now.getTime() } : {}),
    });
    if (plan.dropped.length) log.info("learning dropped operations", { dropped: plan.dropped });
    log.info("learning run", {
      trigger,
      feedback: feedback.length,
      added: plan.add.length,
      updated: plan.update.length,
      retired: plan.retire.length,
    });
    if (plan.add.length) {
      const n = plan.add.length;
      this.deps.notifier?.notify({
        kind: "learned_preferences",
        title: `Job Radar learned ${n} new preference${n === 1 ? "" : "s"}`,
        body: `${plan.add.map((a) => `• ${a.text}`).join("\n")}\nReview them in Settings → Learning.`,
        dedupeKey: `learned_preferences:${now.getTime()}`,
      });
    }
    return {
      ran: true,
      added: plan.add.map((a) => a.text),
      updated: plan.update.length,
      retired: plan.retire.length,
      dropped: plan.dropped.length,
      feedbackUsed: feedback.length,
    };
  }

  /** Rate suggestions from recent "salary too low" dismissals (design D7). */
  refreshSuggestions(): number {
    const { db } = this.deps;
    const rates = this.deps.profile.get()?.preferences.rates;
    if (!rates) return 0;
    const since = new Date(this.now().getTime() - SALARY_LOOKBACK_DAYS * 86_400_000);
    let created = 0;
    for (const s of rateSuggestions(salaryDismissals(db, since), rates)) {
      const res = upsertSuggestion(db, s);
      if (res.created) {
        created++;
        supersedeSuggestions(db, s.kind, s.currency, res.suggestion.id);
      }
    }
    return created;
  }

  async idle(): Promise<void> {
    await this.queue.onIdle();
  }
}

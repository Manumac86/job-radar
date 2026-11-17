import {
  appTimeZone,
  LlmCapReachedError,
  LlmOutputError,
  LlmUnavailableError,
  applyRules,
  budgetDay,
  nextMidnight,
  scoreOfferWithModel,
  withResearchedCompany,
  type CompanyProfile,
  type LlmBudget,
  type LlmClient,
  type OfferForLlm,
} from "@job-radar/core";
import {
  getOffer,
  offersAwaitingScore,
  openOfferIds,
  recordScore,
  setScoreStatus,
  type Db,
  type Offer,
  type Score,
  activeLearnedPreferences,
  currentCompanyResearch,
} from "@job-radar/db";
import PQueue from "p-queue";
import { errorMessage, log } from "../log";
import type { Notifier } from "../notifier";
import type { ProfileService } from "../profile-service";

export function offerForLlm(o: Offer): OfferForLlm {
  return {
    title: o.title,
    companyName: o.companyName,
    companyWebsite: o.companyWebsite,
    location: o.location,
    remotePolicy: o.remotePolicy,
    regions: o.regions,
    engagementType: o.engagementType,
    compensation:
      o.compMin === null && o.compMax === null
        ? null
        : { min: o.compMin, max: o.compMax, currency: o.compCurrency, period: o.compPeriod },
    equityMin: o.equityMin,
    equityMax: o.equityMax,
    description: o.description,
    skills: o.skills,
    companyMeta: o.companyMeta,
    sourceUrl: o.sourceUrl,
  };
}

export type ScoredHook = (offer: Offer, score: Score) => void | Promise<void>;

export interface ScoringStatus {
  queued: number;
  pausedUntil: string | null;
  llm: "ok" | "not_authenticated" | "unavailable" | "unknown";
  llmMessage: string | null;
  budget: ReturnType<LlmBudget["summary"]>;
}

/** LLM work queue with concurrency 2 (design D6); degrades to "awaiting score". */
export class ScoringService {
  private readonly queue = new PQueue({ concurrency: 2 });
  private readonly queued = new Set<number>();
  private pausedUntil: Date | null = null;
  private llmState: ScoringStatus["llm"] = "unknown";
  private llmMessage: string | null = null;
  private hooks: ScoredHook[] = [];

  constructor(
    private readonly deps: {
      db: Db;
      profile: ProfileService;
      client: LlmClient;
      budget: LlmBudget;
      notifier: Notifier;
      now?: () => Date;
    },
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  onScored(hook: ScoredHook): void {
    this.hooks.push(hook);
  }

  /** Adds offers to the queue (no-op while paused; the sweep picks them up later). */
  enqueue(offerIds: number[]): number {
    if (this.isPaused()) return 0;
    let added = 0;
    for (const id of offerIds) {
      if (this.queued.has(id)) continue;
      this.queued.add(id);
      added++;
      void this.queue.add(async () => {
        try {
          if (!this.isPaused()) await this.scoreOne(id);
        } finally {
          this.queued.delete(id);
        }
      });
    }
    return added;
  }

  /** Re-queues every offer awaiting a score (startup, after midnight, after re-login). */
  sweep(limit = 200): number {
    if (this.isPaused()) return 0;
    return this.enqueue(offersAwaitingScore(this.deps.db, limit).map((o) => o.id));
  }

  /** "Rescore open offers": previous scores stay in history. */
  rescoreOpen(): number {
    const ids = openOfferIds(this.deps.db);
    for (const id of ids) setScoreStatus(this.deps.db, id, "awaiting_score");
    this.pausedUntil = null;
    return this.enqueue(ids);
  }

  /** Manual retry for one offer (e.g. after "scoring failed"). */
  retry(offerId: number): boolean {
    const offer = getOffer(this.deps.db, offerId);
    if (!offer) return false;
    setScoreStatus(this.deps.db, offerId, "awaiting_score");
    this.pausedUntil = null;
    this.enqueue([offerId]);
    return true;
  }

  isPaused(): boolean {
    if (this.pausedUntil && this.pausedUntil <= this.now()) this.pausedUntil = null;
    return this.pausedUntil !== null;
  }

  async idle(): Promise<void> {
    await this.queue.onIdle();
  }

  status(): ScoringStatus {
    return {
      queued: this.queued.size,
      pausedUntil: this.pausedUntil?.toISOString() ?? null,
      llm: this.llmState,
      llmMessage: this.llmMessage,
      budget: this.deps.budget.summary(),
    };
  }

  async scoreOne(offerId: number): Promise<Score | null> {
    const { db } = this.deps;
    const offer = getOffer(db, offerId);
    if (!offer || offer.triage === "filtered") return null;
    const profile = this.deps.profile.get();
    if (!profile) {
      log.warn("scoring skipped: profile invalid", { offerId });
      return null; // stays awaiting_score
    }
    setScoreStatus(db, offerId, "scoring");
    const research = offer.companyId ? currentCompanyResearch(db, offer.companyId) : undefined;
    const companyProfile = (research?.profile as CompanyProfile | null | undefined) ?? null;
    try {
      const res = await scoreOfferWithModel(
        { client: this.deps.client, budget: this.deps.budget },
        profile,
        offerForLlm(offer),
        undefined,
        activeLearnedPreferences(db).map((l) => ({ text: l.text, polarity: l.polarity })),
        companyProfile && research?.finishedAt
          ? { profile: companyProfile, researchedAt: research.finishedAt }
          : null,
      );
      const final = applyRules(
        withResearchedCompany(res.score, companyProfile),
        offerForLlm(offer),
        profile.preferences,
      );
      const score = recordScore(db, {
        offerId,
        overall: final.overall,
        modelOverall: final.modelOverall,
        skillsFit: res.score.skills_fit,
        seniorityFit: res.score.seniority_fit,
        rateFit: res.score.rate_fit,
        locationFit: res.score.location_fit,
        engagementFit: res.score.engagement_fit,
        scoreClass: final.scoreClass,
        rationale: res.score.rationale,
        redFlags: final.redFlags,
        serviceLines: res.score.service_lines,
        isLeadership: res.score.is_leadership,
        model: res.model,
        createdAt: this.now(),
      });
      this.llmState = "ok";
      this.llmMessage = null;
      const updated = getOffer(db, offerId);
      if (updated) {
        for (const hook of this.hooks) {
          await Promise.resolve(hook(updated, score)).catch((err: unknown) =>
            log.error("scored hook failed", { offerId, error: errorMessage(err) }),
          );
        }
      }
      return score;
    } catch (err) {
      if (err instanceof LlmCapReachedError) {
        setScoreStatus(db, offerId, "awaiting_score");
        this.pausedUntil = nextMidnight(this.now(), appTimeZone());
        this.queue.clear();
        this.queued.clear();
        return null;
      }
      if (err instanceof LlmUnavailableError) {
        setScoreStatus(db, offerId, "awaiting_score");
        this.llmState = err.reason === "not_authenticated" ? "not_authenticated" : "unavailable";
        this.llmMessage = err.message;
        // Retry in 30 minutes; the owner may log in meanwhile.
        this.pausedUntil = new Date(this.now().getTime() + 30 * 60_000);
        this.queue.clear();
        this.queued.clear();
        this.deps.notifier.notify({
          kind: "llm_unavailable",
          title: "Scoring paused: Claude Code is not available",
          body: err.message,
          dedupeKey: `llm_unavailable:${budgetDay(this.now())}`,
        });
        return null;
      }
      const message = err instanceof LlmOutputError ? err.message : errorMessage(err);
      setScoreStatus(db, offerId, "scoring_failed", message);
      log.warn("scoring failed", { offerId, error: message });
      return null;
    }
  }
}

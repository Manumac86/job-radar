import {
  LlmCapReachedError,
  LlmUnavailableError,
  isInterviewStage,
  prepareInterview,
  type CompanyProfile,
  type CompanyProfileForPrompt,
  type LlmBudget,
  type LlmClient,
} from "@job-radar/core";
import {
  createInterviewPrep,
  getApplication,
  getOffer,
  interviewsFor,
  latestInterviewPrep,
  listStages,
  type Db,
  type InterviewPrep,
} from "@job-radar/db";
import PQueue from "p-queue";
import { errorMessage, log } from "../log";
import type { Notifier } from "../notifier";
import type { ProfileService } from "../profile-service";
import type { ResearchService } from "../research/service";
import { offerForLlm } from "../scoring/service";

export class PrepError extends Error {
  override readonly name = "PrepError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Interview preparation plans, one at a time with the drafting model and drafts cap. */
export class PrepService {
  private readonly queue = new PQueue({ concurrency: 1 });

  constructor(
    private readonly deps: {
      db: Db;
      profile: ProfileService;
      client: LlmClient;
      budget: LlmBudget;
      notifier?: Notifier;
      research?: ResearchService;
    },
  ) {}

  /**
   * A company profile younger than 30 days, researching first when there is none and the
   * research cap allows (company-research: "Company research in interview prep").
   */
  private async companyFor(
    offerId: number,
  ): Promise<{ company: CompanyProfileForPrompt | null; unavailable: string }> {
    const offer = getOffer(this.deps.db, offerId);
    const research = this.deps.research;
    if (!offer?.companyId || !research)
      return { company: null, unavailable: "Company research is not available" };
    let row = null;
    try {
      row = await research.freshProfile(offer.companyId, offer.id);
    } catch (err) {
      log.warn("prep research failed", { offerId, error: errorMessage(err) });
    }
    if (row?.profile && row.finishedAt)
      return {
        company: {
          profile: row.profile as unknown as CompanyProfile,
          researchedAt: row.finishedAt,
        },
        unavailable: "",
      };
    const latest = research.state(offer.companyId).latest;
    return {
      company: null,
      unavailable: latest?.error
        ? `Company research unavailable: ${latest.error}`
        : "Company research unavailable",
    };
  }

  async generate(applicationId: number): Promise<InterviewPrep> {
    const pre = getApplication(this.deps.db, applicationId);
    const companyInfo = pre
      ? await this.companyFor(pre.offerId)
      : { company: null, unavailable: "Company research is not available" };
    return this.queue.add(async () => {
      const { db } = this.deps;
      const app = getApplication(db, applicationId);
      const offer = app ? getOffer(db, app.offerId) : undefined;
      if (!app || !offer) throw new PrepError("Application not found", 404);
      const profile = this.deps.profile.get();
      if (!profile) throw new PrepError("Profile is invalid; fix it in Settings first", 409);
      const stage = listStages(db).find((s) => s.key === app.stage);
      const all = interviewsFor(db, app.id);
      const now = Date.now();
      const next = all.find((i) => i.scheduledAt.getTime() >= now) ?? all.at(-1) ?? null;
      const notes = all.flatMap((i) =>
        [
          i.prepNotes ? `${i.type} prep notes: ${i.prepNotes}` : "",
          i.outcome ? `${i.type} outcome: ${i.outcome}` : "",
        ].filter(Boolean),
      );
      try {
        const res = await prepareInterview(
          { client: this.deps.client, budget: this.deps.budget },
          profile,
          offerForLlm(offer),
          {
            stage: app.stage,
            stageLabel: stage?.label ?? app.stage,
            interview: next
              ? {
                  type: next.type,
                  scheduledAt: next.scheduledAt.toISOString(),
                  durationMinutes: next.durationMinutes,
                  interviewers: next.interviewers,
                }
              : null,
            notes,
            company: companyInfo.company,
          },
          { companyUnavailable: companyInfo.unavailable },
        );
        return createInterviewPrep(db, {
          applicationId: app.id,
          stage: app.stage,
          plan: res.plan,
          model: res.model,
        });
      } catch (err) {
        if (err instanceof LlmCapReachedError) throw new PrepError(err.message, 429);
        if (err instanceof LlmUnavailableError) throw new PrepError(err.message, 503);
        throw new PrepError(`Interview prep failed: ${errorMessage(err)}`, 502);
      }
    });
  }

  /**
   * Called when an application moves: an interview stage without a plan gets one, and the
   * owner is told it is ready. Returns null when nothing was generated.
   */
  async autoPrepare(applicationId: number): Promise<InterviewPrep | null> {
    const { db } = this.deps;
    const app = getApplication(db, applicationId);
    if (!app) return null;
    const label = listStages(db).find((s) => s.key === app.stage)?.label ?? "";
    if (!isInterviewStage(app.stage, label)) return null;
    if (latestInterviewPrep(db, app.id, app.stage)) return null;
    try {
      const prep = await this.generate(applicationId);
      const offer = getOffer(db, app.offerId);
      if (offer)
        this.deps.notifier?.notify({
          kind: "interview_prep",
          title: `Interview prep ready: ${offer.companyName}`,
          body: `${label || app.stage}: ${prep.plan.likely_questions.length} likely questions, ${prep.plan.gaps_to_prepare.length} gaps to prepare and ${prep.plan.questions_to_ask.length} questions to ask. Open the application on the pipeline board.`,
          offerId: offer.id,
          applicationId: app.id,
          dedupeKey: `interview_prep:${app.id}:${app.stage}`,
        });
      return prep;
    } catch (err) {
      log.warn("interview prep skipped", { applicationId, error: errorMessage(err) });
      return null;
    }
  }

  async idle(): Promise<void> {
    await this.queue.onIdle();
  }
}

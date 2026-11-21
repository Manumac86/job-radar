import {
  LlmCapReachedError,
  LlmUnavailableError,
  MASTER_CV_ID,
  draftApplication,
  type CompanyProfile,
  type LlmBudget,
  type LlmClient,
} from "@job-radar/core";
import {
  createDraft,
  currentCompanyResearch,
  getOffer,
  latestDraft,
  scoreHistory,
  type Db,
  type Draft,
} from "@job-radar/db";
import PQueue from "p-queue";
import { errorMessage, log } from "../log";
import type { ProfileService } from "../profile-service";
import { offerForLlm } from "../scoring/service";

export class DraftError extends Error {
  override readonly name = "DraftError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Drafts are generated one at a time with the stronger model (design D3). */
export class DraftService {
  private readonly queue = new PQueue({ concurrency: 1 });

  constructor(
    private readonly deps: {
      db: Db;
      profile: ProfileService;
      client: LlmClient;
      budget: LlmBudget;
    },
  ) {}

  /**
   * `cvVariantId`: the CV version to write for; defaults to the offer's recommended variant.
   * "master" (or no variants) writes for the master CV.
   */
  async generate(
    offerId: number,
    options: { instruction?: string | null; cvVariantId?: string | null } = {},
  ): Promise<Draft> {
    return this.queue.add(async () => {
      const { db } = this.deps;
      const offer = getOffer(db, offerId);
      if (!offer) throw new DraftError("Offer not found", 404);
      const profile = this.deps.profile.get();
      if (!profile) throw new DraftError("Profile is invalid; fix it in Settings first", 409);
      const previous = latestDraft(db, offerId);
      const score = scoreHistory(db, offerId)[0];
      const research = offer.companyId ? currentCompanyResearch(db, offer.companyId) : undefined;
      const wanted = options.cvVariantId ?? score?.recommendedCv ?? null;
      const variant =
        wanted && wanted !== MASTER_CV_ID
          ? (profile.variants ?? []).find((v) => v.id === wanted)
          : undefined;
      if (options.cvVariantId && options.cvVariantId !== MASTER_CV_ID && !variant)
        throw new DraftError(`No CV variant "${options.cvVariantId}"`, 400);
      try {
        const res = await draftApplication(
          { client: this.deps.client, budget: this.deps.budget },
          profile,
          offerForLlm(offer),
          {
            instruction: options.instruction ?? null,
            previousMessage: options.instruction ? (previous?.message ?? null) : null,
            serviceLines: score?.serviceLines ?? [],
            company:
              research?.profile && research.finishedAt
                ? {
                    profile: research.profile as unknown as CompanyProfile,
                    researchedAt: research.finishedAt,
                  }
                : null,
            cvVariant: variant ?? null,
          },
        );
        return createDraft(db, {
          offerId,
          message: res.draft.message,
          screeningAnswers: res.draft.screening_answers,
          suggestedRate: res.draft.suggested_rate,
          verifyBeforeSending: res.draft.verify_before_sending,
          companyFactsUsed: res.draft.company_facts_used,
          instruction: options.instruction ?? null,
          cvVariant: variant?.id ?? ((profile.variants ?? []).length ? MASTER_CV_ID : null),
          cvVariantName: variant?.name ?? ((profile.variants ?? []).length ? "Master CV" : null),
          model: res.model,
        });
      } catch (err) {
        if (err instanceof LlmCapReachedError) throw new DraftError(err.message, 429);
        if (err instanceof LlmUnavailableError) throw new DraftError(err.message, 503);
        throw new DraftError(`Draft generation failed: ${errorMessage(err)}`, 502);
      }
    });
  }

  /** Strong matches get a draft automatically, once (application-drafts spec). */
  async autoDraft(offerId: number): Promise<Draft | null> {
    if (latestDraft(this.deps.db, offerId)) return null;
    try {
      return await this.generate(offerId);
    } catch (err) {
      log.warn("auto-draft skipped", { offerId, error: errorMessage(err) });
      return null;
    }
  }

  async idle(): Promise<void> {
    await this.queue.onIdle();
  }
}

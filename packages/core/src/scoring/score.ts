import { callStructured, type StructuredDeps } from "../llm/structured";
import type { OfferForLlm } from "../offers/types";
import type { Profile } from "../profile/schema";
import type { CompanyProfileForPrompt } from "../research/prompt";
import type { CompanyProfile } from "../research/schema";
import { SCORING_SYSTEM, buildScoringPrompt, type LearnedForPrompt } from "./prompt";
import type { CvVariant } from "../profile/variants";
import { modelScoreSchema, modelScoreWithCvSchema, type ModelScore } from "./schema";

/** Asks the model for a structured score. Hard rules are applied afterwards (rules.ts). */
export async function scoreOfferWithModel(
  deps: StructuredDeps,
  profile: Profile,
  offer: OfferForLlm,
  model = profile.preferences.scoring.models.scoring,
  learned: LearnedForPrompt[] = [],
  company: CompanyProfileForPrompt | null = null,
): Promise<{ score: ModelScore; model: string; attempts: number }> {
  const variants = profile.variants ?? [];
  const res = await callStructured<ModelScore>(deps, {
    kind: "scoring",
    model,
    system: SCORING_SYSTEM,
    prompt: buildScoringPrompt(profile, offer, learned, company),
    schema: variants.length ? modelScoreWithCvSchema : modelScoreSchema,
    schemaName: "offer_score",
  });
  return { score: knownVariantOnly(res.value, variants), model: res.model, attempts: res.attempts };
}

/** Drops a recommendation that names no existing variant; the score itself is kept. */
export function knownVariantOnly(score: ModelScore, variants: readonly CvVariant[]): ModelScore {
  if (!score.cv) return score;
  if (variants.some((v) => v.id === score.cv?.recommended)) return score;
  const { cv: _dropped, ...rest } = score;
  return rest;
}

const RULE_STAGES = new Set<string>(modelScoreSchema.shape.company.shape.stage.options);

/**
 * Researched facts replace the model's guess for the leadership stage and team-size rule
 * (company-research: "Company profile in scoring"), so the rule holds even if the model ignores
 * the profile.
 */
export function withResearchedCompany(
  score: ModelScore,
  profile: CompanyProfile | null,
): ModelScore {
  if (!profile) return score;
  const stage = profile.funding?.value.stage;
  const team = profile.engineering_team_size?.value ?? null;
  return {
    ...score,
    company: {
      stage:
        stage && stage !== "unknown" && RULE_STAGES.has(stage)
          ? (stage as ModelScore["company"]["stage"])
          : score.company.stage,
      engineering_team_size: team ?? score.company.engineering_team_size,
    },
  };
}

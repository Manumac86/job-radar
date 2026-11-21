import { callStructured, type StructuredDeps } from "../llm/structured";
import type { OfferForLlm } from "../offers/types";
import type { Profile } from "../profile/schema";
import type { CvVariant } from "../profile/variants";
import type { CompanyProfileForPrompt } from "../research/prompt";
import { normalizeSourceUrl } from "../research/urls";
import type { CompanyProfile } from "../research/schema";
import { groundDraft } from "./grounding";
import { buildDraftPrompt, draftingSystem } from "./prompt";
import { DEFAULT_MAX_WORDS, modelDraftSchema, wordCount, type ModelDraft } from "./schema";

export interface DraftOptions {
  instruction?: string | null;
  serviceLines?: string[];
  previousMessage?: string | null;
  maxWords?: number;
  model?: string;
  company?: CompanyProfileForPrompt | null;
  /** The CV version the owner will send (cv-variants D4); facts still come from the master CV. */
  cvVariant?: CvVariant | null;
}

/** Every source URL in the profile, normalized. */
function profileSources(p: CompanyProfile): Set<string> {
  const urls = [
    ...[
      p.product,
      p.funding,
      p.headcount,
      p.engineering_team_size,
      p.headquarters,
      p.remote_policy,
      p.tech_stack,
    ].flatMap((f) => f?.sources ?? []),
    ...p.news.map((n) => n.source),
    ...p.red_flags.map((r) => r.source),
  ];
  return new Set(urls.map(normalizeSourceUrl).filter((u): u is string => u !== null));
}

/** Keeps only company facts that cite a source present in the profile (none without one). */
export function groundCompanyFacts(
  facts: { fact: string; source: string }[],
  company: CompanyProfile | null,
): { fact: string; source: string }[] {
  if (!company) return [];
  const allowed = profileSources(company);
  const seen = new Set<string>();
  return facts.filter((f) => {
    const n = normalizeSourceUrl(f.source);
    if (!n || !allowed.has(n) || seen.has(f.fact)) return false;
    seen.add(f.fact);
    return true;
  });
}

/** Keeps the suggested rate at or above the owner's minimum (rates are profile facts). */
export function clampRate(draft: ModelDraft, profile: Profile): ModelDraft {
  const r = draft.suggested_rate;
  if (!r) return draft;
  const rates = profile.preferences.rates;
  let min: number | undefined;
  if (r.period === "hour") min = rates.min_hourly[r.currency];
  if (r.period === "day" && r.currency === "EUR") min = rates.min_daily_eur;
  if (min !== undefined && r.amount < min) {
    return {
      ...draft,
      suggested_rate: {
        ...r,
        amount: rates.target_hourly?.[r.currency] ?? min,
        reasoning: `${r.reasoning} (raised to your minimum or target rate)`,
      },
    };
  }
  return draft;
}

export async function draftApplication(
  deps: StructuredDeps,
  profile: Profile,
  offer: OfferForLlm,
  options: DraftOptions = {},
): Promise<{ draft: ModelDraft; model: string; attempts: number }> {
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
  const schema = modelDraftSchema.refine((d) => wordCount(d.message) <= maxWords + 15, {
    message: `message must be at most ${maxWords} words`,
    path: ["message"],
  });
  const res = await callStructured(deps, {
    kind: "drafting",
    model: options.model ?? profile.preferences.scoring.models.drafting,
    system: draftingSystem(maxWords),
    prompt: buildDraftPrompt(profile, offer, options),
    schema,
    schemaName: "application_draft",
  });
  const trusted = [profile.cv, JSON.stringify(profile.preferences)];
  // Figures from the company profile (a round's amount, a team size) are sourced facts too.
  const companyText = options.company ? JSON.stringify(options.company.profile) : "";
  const grounded = groundDraft(
    res.value,
    trusted,
    `${offer.title}\n${offer.description}\n${companyText}`,
  );
  const draft = {
    ...grounded,
    company_facts_used: groundCompanyFacts(
      res.value.company_facts_used,
      options.company?.profile ?? null,
    ),
  };
  return { draft: clampRate(draft, profile), model: res.model, attempts: res.attempts };
}

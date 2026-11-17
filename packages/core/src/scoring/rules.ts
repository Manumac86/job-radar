// Hard eligibility rules and score classes (job-scoring spec). Deterministic, applied after
// the model so the caps hold even if the model is wrong or manipulated.
import type { Compensation } from "../offers/types";
import type { Preferences } from "../profile/schema";
import type { ModelScore } from "./schema";

export const ELIGIBILITY_CAP = 30;
/** Hours used to compare salaries with hourly rates: 220 working days × 8 h. */
export const HOURS_PER_YEAR = 1760;

export type ScoreClass = "strong" | "possible" | "weak";

export interface RuleInput {
  title: string;
  location?: string | null;
  regions: string[];
  description: string;
  compensation: Compensation | null;
  companyMeta: Record<string, unknown>;
}

export interface FinalScore {
  overall: number;
  modelOverall: number;
  scoreClass: ScoreClass;
  redFlags: string[];
  capped: boolean;
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ["us", "usa", "united states", "u.s.", "america"],
  UK: ["uk", "united kingdom", "great britain", "britain"],
  Canada: ["canada", "ca"],
  EU: ["eu", "european union", "europe", "emea"],
};

function canonicalPlace(place: string): string {
  const p = place.trim().toLowerCase();
  for (const [canon, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.includes(p) || p === canon.toLowerCase()) return canon;
  }
  return place.trim();
}

/** Places the owner may work from: work authorization plus accepted remote-contractor regions. */
function ownerCovers(place: string, prefs: Preferences): boolean {
  const canon = canonicalPlace(place);
  const auth = prefs.owner.work_authorization.map(canonicalPlace);
  if (auth.includes(canon)) return true;
  // EU authorization covers EU member states, e.g. Spain, Germany.
  if (
    auth.includes("EU") &&
    /spain|germany|france|portugal|italy|netherlands|ireland|belgium|austria|poland|sweden|denmark|finland/i.test(
      place,
    )
  ) {
    return true;
  }
  return false;
}

const RESIDENCY_PATTERNS: { re: RegExp; place: string }[] = [
  {
    re: /\b(us|u\.s\.) citizen(ship)?\/visa only|\bus citizens? only\b|must be (a )?(us|u\.s\.) citizen|(us|u\.s\.) work authori[sz]ation (is )?required|authori[sz]ed to work in the (us|united states)|must (be located|reside|live) in the (us|united states|u\.s\.)|remote \((us|usa|united states)\)|\(us only\)|\busa only\b|\bus only\b|security clearance/i,
    place: "US",
  },
  {
    re: /must (be located|reside|live) in (the )?(uk|united kingdom)|right to work in the uk|\buk only\b|remote \(uk\)/i,
    place: "UK",
  },
  { re: /must (be located|reside|live) in canada|canada only|remote \(canada\)/i, place: "Canada" },
];

/** Residency or work-authorization requirements stated in the offer text. */
export function statedResidency(offer: RuleInput): string[] {
  const text = [offer.title, offer.location ?? "", offer.description.slice(0, 6000)].join("\n");
  const found = new Set<string>();
  for (const { re, place } of RESIDENCY_PATTERNS) if (re.test(text)) found.add(place);
  // "Will sponsor" or "visa not required" cancels a visa-only requirement.
  if (/will sponsor|visa sponsorship (is )?available|citizenship\/visa not required/i.test(text))
    found.delete("US");
  return [...found];
}

/** Hourly equivalent of a stated rate, or null when it cannot be compared. */
export function hourlyEquivalent(
  c: Compensation | null,
): { value: number; currency: string } | null {
  if (!c || !c.currency || !c.period) return null;
  const amount = (c.max ?? c.min ?? 0) / 100; // compare the top of the range (most favorable)
  if (!amount) return null;
  const perHour: Record<string, number | null> = {
    hour: amount,
    day: amount / 8,
    week: amount / 40,
    month: (amount * 12) / HOURS_PER_YEAR,
    year: amount / HOURS_PER_YEAR,
    project: null,
  };
  const value = perHour[c.period];
  return value === null || value === undefined ? null : { value, currency: c.currency };
}

/** Red flag when the stated rate is below the owner's minimum, else null. */
export function rateBelowMinimum(c: Compensation | null, prefs: Preferences): string | null {
  if (!c || !c.currency) return null;
  const top = (c.max ?? c.min ?? 0) / 100;
  if (c.period === "day" && c.currency === "EUR" && top < prefs.rates.min_daily_eur) {
    return `Rate below minimum (${top} EUR/day < ${prefs.rates.min_daily_eur} EUR/day)`;
  }
  const hourly = hourlyEquivalent(c);
  const min = hourly ? prefs.rates.min_hourly[hourly.currency] : undefined;
  if (!hourly || min === undefined) return null;
  if (hourly.value < min) {
    return `Rate below minimum (≈${Math.round(hourly.value)} ${hourly.currency}/h < ${min} ${hourly.currency}/h)`;
  }
  return null;
}

const STAGE_ORDER = ["pre-seed", "seed", "series-a", "series-b", "series-c", "later", "public"];

export function classify(
  score: number,
  thresholds: { strong: number; possible: number },
): ScoreClass {
  if (score >= thresholds.strong) return "strong";
  if (score >= thresholds.possible) return "possible";
  return "weak";
}

export function applyRules(model: ModelScore, offer: RuleInput, prefs: Preferences): FinalScore {
  const flags = new Set(model.red_flags.map((f) => f.trim()).filter(Boolean));
  let capped = false;

  // Residency / work authorization the owner does not have.
  const required = new Set(
    [...model.eligibility.restricted_to, ...statedResidency(offer)].map(canonicalPlace),
  );
  const missing = [...required].filter((p) => !ownerCovers(p, prefs));
  if (missing.length || !model.eligibility.owner_eligible) {
    capped = true;
    for (const place of missing.length ? missing : ["the required location"]) {
      flags.add(`${place} residency required`);
    }
  }

  // Stated rate below the minimum.
  const rateFlag = rateBelowMinimum(offer.compensation, prefs);
  if (rateFlag) {
    capped = true;
    flags.add(rateFlag);
  }

  // Leadership roles: company stage and size vs target.
  if (model.is_leadership) {
    const target = prefs.leadership_target;
    const teamSize =
      model.company.engineering_team_size ??
      (typeof offer.companyMeta["team_size"] === "number"
        ? (offer.companyMeta["team_size"] as number)
        : null);
    const stageIdx = STAGE_ORDER.indexOf(model.company.stage);
    const maxIdx = Math.max(...target.company_stage.map((s) => STAGE_ORDER.indexOf(s)));
    const tooLate = stageIdx >= 0 && maxIdx >= 0 && stageIdx > maxIdx;
    const tooBig = teamSize !== null && teamSize > target.max_engineering_team;
    if (tooLate || tooBig) flags.add("company stage above target");
  }

  const overall = capped ? Math.min(model.overall, ELIGIBILITY_CAP) : model.overall;
  return {
    overall,
    modelOverall: model.overall,
    scoreClass: classify(overall, prefs.scoring.thresholds),
    redFlags: [...flags],
    capped,
  };
}

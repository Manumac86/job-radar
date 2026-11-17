// Deterministic hard-preference suggestions (offer-feedback spec, design D7).

export interface SalaryDismissal {
  offerId: number;
  /** Minor units. */
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
  compPeriod: string | null;
}

export interface RatePreferences {
  min_hourly: Record<string, number>;
  min_daily_eur: number;
}

export interface RateSuggestion {
  kind: "raise_min_hourly" | "raise_min_daily";
  currency: string;
  /** Major units, rounded up to a multiple of 5. */
  value: number;
  evidence: number[];
}

export const MIN_SALARY_DISMISSALS = 2;
export const SALARY_LOOKBACK_DAYS = 60;

const ceil5 = (n: number) => Math.ceil(n / 5) * 5;

/**
 * At least two offers dismissed as "salary too low" that state a rate above the owner's
 * minimum mean the minimum is too low: propose the highest stated rate, rounded up to 5.
 */
export function rateSuggestions(
  dismissals: SalaryDismissal[],
  rates: RatePreferences,
): RateSuggestion[] {
  const groups = new Map<
    string,
    {
      kind: RateSuggestion["kind"];
      currency: string;
      min: number;
      hits: { id: number; rate: number }[];
    }
  >();
  for (const d of dismissals) {
    const stated = d.compMax ?? d.compMin;
    if (stated === null || !d.compCurrency) continue;
    const rate = stated / 100;
    let kind: RateSuggestion["kind"];
    let min: number | undefined;
    if (d.compPeriod === "hour") {
      kind = "raise_min_hourly";
      min = rates.min_hourly[d.compCurrency];
    } else if (d.compPeriod === "day" && d.compCurrency === "EUR") {
      kind = "raise_min_daily";
      min = rates.min_daily_eur;
    } else continue;
    if (min === undefined || rate <= min) continue;
    const key = `${kind}:${d.compCurrency}`;
    const g = groups.get(key) ?? { kind, currency: d.compCurrency, min, hits: [] };
    g.hits.push({ id: d.offerId, rate });
    groups.set(key, g);
  }
  const out: RateSuggestion[] = [];
  for (const g of groups.values()) {
    if (g.hits.length < MIN_SALARY_DISMISSALS) continue;
    const value = ceil5(Math.max(...g.hits.map((h) => h.rate)));
    if (value <= g.min) continue;
    out.push({
      kind: g.kind,
      currency: g.currency,
      value,
      evidence: [...new Set(g.hits.map((h) => h.id))],
    });
  }
  return out;
}

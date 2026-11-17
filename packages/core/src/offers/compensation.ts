import type { Compensation } from "./types";

const SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };
const CODES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN"];

function amount(num: string, suffix: string | undefined): number {
  const n = Number(num.replace(/,/g, ""));
  return /k/i.test(suffix ?? "") ? n * 1000 : n;
}

function detectPeriod(text: string, value: number): Compensation["period"] {
  if (/\/\s*h(ou)?r?\b|per hour|hourly|\/hr|an hour/i.test(text)) return "hour";
  if (/\/\s*day|per day|daily|day rate/i.test(text)) return "day";
  if (/\/\s*week|per week|weekly/i.test(text)) return "week";
  if (/\/\s*mo(nth)?|per month|monthly/i.test(text)) return "month";
  if (/\/\s*y(ea)?r|per year|annual|yearly|\bpa\b|p\.a\./i.test(text)) return "year";
  if (/fixed|per project|budget/i.test(text)) return "project";
  if (value >= 20_000) return "year";
  return null;
}

/**
 * Best-effort parse of a stated rate or salary from free text. Returns null when no
 * amount with a currency is stated — compensation is never estimated (job-ingestion spec).
 */
export function parseCompensation(text: string | null | undefined): Compensation | null {
  if (!text) return null;
  const re =
    /(?:([$€£])|\b(USD|EUR|GBP|CAD|AUD|CHF|SEK|NOK|DKK|PLN)\s?)?(\d{1,3}(?:[,\d]{0,8})(?:\.\d+)?)\s?(k|K)?\s?(?:([$€£])|(USD|EUR|GBP|CAD|AUD|CHF)\b)?(?:\s?(?:-|–|—|to)\s?(?:[$€£]|USD|EUR|GBP)?\s?(\d{1,3}(?:[,\d]{0,8})(?:\.\d+)?)\s?(k|K)?)?/g;
  for (const m of text.matchAll(re)) {
    const currency = (m[1] && SYMBOLS[m[1]]) || m[2] || (m[5] && SYMBOLS[m[5]]) || m[6] || null;
    if (!currency || !CODES.includes(currency)) continue;
    const low = amount(m[3] ?? "0", m[4] ?? m[8]);
    const high = m[7] ? amount(m[7], m[8]) : null;
    if (!low || low < 5) continue;
    const start = m.index ?? 0;
    const context = text.slice(Math.max(0, start - 20), start + m[0].length + 25);
    const period = detectPeriod(context, high ?? low);
    return {
      min: Math.round(low * 100),
      max: Math.round((high ?? low) * 100),
      currency,
      period,
    };
  }
  return null;
}

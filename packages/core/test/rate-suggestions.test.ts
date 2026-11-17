import { describe, expect, it } from "vitest";
import { rateSuggestions, type SalaryDismissal } from "../src";

const rates = { min_hourly: { EUR: 50, USD: 75 }, min_daily_eur: 500 };
const d = (offerId: number, eur: number, period = "hour", currency = "EUR"): SalaryDismissal => ({
  offerId,
  compMin: eur * 100,
  compMax: eur * 100,
  compCurrency: currency,
  compPeriod: period,
});

describe("rateSuggestions", () => {
  it("proposes the highest stated rate rounded up to 5 after two dismissals", () => {
    expect(rateSuggestions([d(1, 55), d(2, 62)], rates)).toEqual([
      { kind: "raise_min_hourly", currency: "EUR", value: 65, evidence: [1, 2] },
    ]);
  });

  it("needs two dismissals above the minimum in the same currency", () => {
    expect(rateSuggestions([d(1, 55)], rates)).toEqual([]);
    expect(rateSuggestions([d(1, 45), d(2, 55)], rates)).toEqual([]);
    expect(rateSuggestions([d(1, 80, "hour", "USD"), d(2, 55)], rates)).toEqual([]);
  });

  it("handles day rates in EUR and ignores other periods or unknown rates", () => {
    expect(rateSuggestions([d(1, 520, "day"), d(2, 610, "day")], rates)).toEqual([
      { kind: "raise_min_daily", currency: "EUR", value: 610, evidence: [1, 2] },
    ]);
    const unknown = {
      offerId: 3,
      compMin: null,
      compMax: null,
      compCurrency: null,
      compPeriod: null,
    };
    expect(rateSuggestions([d(1, 90_000, "year"), d(2, 95_000, "year"), unknown], rates)).toEqual(
      [],
    );
  });
});

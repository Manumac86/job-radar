import { describe, expect, it } from "vitest";
import { excludedCompany, prefilter } from "../src/offers/prefilter";

const keywords = { include: ["AI"], exclude: [], exclude_companies: ["Crossover", "Acme Corp"] };

describe("excluded companies", () => {
  it("matches whole words, ignoring case", () => {
    expect(excludedCompany("Crossover for Work", keywords.exclude_companies)).toBe("Crossover");
    expect(excludedCompany("acme corp", keywords.exclude_companies)).toBe("Acme Corp");
    expect(excludedCompany("Crossovers Ltd", keywords.exclude_companies)).toBeNull();
    expect(excludedCompany("Acme", keywords.exclude_companies)).toBeNull();
  });

  it("filters offers from an excluded company before any keyword check", () => {
    const r = prefilter(
      { title: "AI Engineer", description: "AI", companyName: "Crossover" },
      keywords,
    );
    expect(r).toEqual({
      pass: false,
      keyword: "Crossover",
      reason: 'Excluded company "Crossover"',
    });
    expect(
      prefilter({ title: "AI Engineer", description: "AI", companyName: "Linear" }, keywords).pass,
    ).toBe(true);
  });
});

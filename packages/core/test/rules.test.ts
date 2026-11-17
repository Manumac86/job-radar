import { describe, expect, it } from "vitest";
import {
  applyRules,
  classify,
  rateBelowMinimum,
  statedResidency,
  type ModelScore,
  type RuleInput,
} from "../src/index";
import { loadSeedProfile } from "./seed-profile";

const prefs = loadSeedProfile().preferences;

const model = (overrides: Partial<ModelScore> = {}): ModelScore => ({
  overall: 88,
  skills_fit: 90,
  seniority_fit: 85,
  rate_fit: 50,
  location_fit: 80,
  engagement_fit: 80,
  rationale: "Strong overlap with agentic RAG and Next.js work.",
  red_flags: [],
  service_lines: ["agentic-rag"],
  is_leadership: false,
  eligibility: { restricted_to: [], owner_eligible: true },
  company: { stage: "unknown", engineering_team_size: null },
  ...overrides,
});

const offer = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  title: "Senior AI Engineer",
  location: "Remote (Europe)",
  regions: ["Europe"],
  description: "Agentic RAG.",
  compensation: null,
  companyMeta: {},
  ...overrides,
});

describe("hard eligibility rules", () => {
  it("caps a US-only offer at 30 with the red flag, even if the model missed it", () => {
    const r = applyRules(
      model(),
      offer({ location: "Remote (US) · US citizen/visa only", regions: ["US"] }),
      prefs,
    );
    expect(r.overall).toBe(30);
    expect(r.modelOverall).toBe(88);
    expect(r.scoreClass).toBe("weak");
    expect(r.redFlags).toContain("US residency required");
  });

  it("trusts the model's eligibility verdict too", () => {
    const r = applyRules(
      model({ eligibility: { restricted_to: ["US"], owner_eligible: false } }),
      offer(),
      prefs,
    );
    expect(r).toMatchObject({ overall: 30, capped: true });
    expect(r.redFlags).toEqual(["US residency required"]);
  });

  it("does not cap EU or Spain requirements for an EU-authorized owner", () => {
    expect(
      applyRules(
        model({ eligibility: { restricted_to: ["EU", "Spain"], owner_eligible: true } }),
        offer(),
        prefs,
      ).overall,
    ).toBe(88);
    expect(
      statedResidency(offer({ description: "US citizenship/visa not required. Will sponsor." })),
    ).toEqual([]);
  });

  it("flags and caps a stated rate below the minimum", () => {
    const hourly = applyRules(
      model(),
      offer({ compensation: { min: 4000, max: 5000, currency: "EUR", period: "hour" } }),
      prefs,
    );
    expect(hourly.overall).toBe(30);
    expect(hourly.redFlags).toContain("Rate below minimum (≈50 EUR/h < 55 EUR/h)");
    expect(
      rateBelowMinimum({ min: 30_000, max: 35_000, currency: "EUR", period: "day" }, prefs),
    ).toBe("Rate below minimum (350 EUR/day < 400 EUR/day)");
    // $135k–$300k a year ≈ $170/h: fine.
    expect(
      rateBelowMinimum(
        { min: 13_500_000, max: 30_000_000, currency: "USD", period: "year" },
        prefs,
      ),
    ).toBeNull();
    // Unknown rate is never treated as below minimum.
    expect(applyRules(model(), offer({ compensation: null }), prefs).capped).toBe(false);
  });

  it("flags leadership roles at companies above the target stage", () => {
    const big = applyRules(
      model({ is_leadership: true, company: { stage: "public", engineering_team_size: 400 } }),
      offer({ title: "CTO" }),
      prefs,
    );
    expect(big.redFlags).toContain("company stage above target");
    const seed = applyRules(
      model({ is_leadership: true, company: { stage: "seed", engineering_team_size: 6 } }),
      offer({ title: "CTO" }),
      prefs,
    );
    expect(seed.redFlags).not.toContain("company stage above target");
    // Team size from YC company data is used when the model has none.
    const yc = applyRules(
      model({ is_leadership: true }),
      offer({ companyMeta: { team_size: 120 } }),
      prefs,
    );
    expect(yc.redFlags).toContain("company stage above target");
  });

  it("classifies by the configured thresholds", () => {
    const t = { strong: 80, possible: 60 };
    expect([
      classify(85, t),
      classify(80, t),
      classify(79, t),
      classify(60, t),
      classify(59, t),
    ]).toEqual(["strong", "strong", "possible", "possible", "weak"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  FakeLlmClient,
  VARIANT_PROMPT_CHARS,
  VARIANTS_PROMPT_TOTAL,
  applyRules,
  buildScoringPrompt,
  cvVariantsBlock,
  modelScoreSchema,
  modelScoreWithCvSchema,
  scoreOfferWithModel,
  type CvVariant,
  type ModelScore,
  type OfferForLlm,
  type Profile,
} from "../src/index";
import { loadSeedProfile } from "./seed-profile";

const base = loadSeedProfile();
const variants: CvVariant[] = [
  { id: "ai-engineer", name: "AI Engineer", useFor: "LLM and RAG roles", text: "Built RAG." },
  { id: "tech-lead", name: "Tech Lead", useFor: "Lead and EM roles", text: "Led 6 engineers." },
];
const withVariants: Profile = { ...base, variants };

const offer: OfferForLlm = {
  title: "Head of Engineering",
  companyName: "Northwind",
  location: "Remote (EU)",
  remotePolicy: "remote",
  regions: ["EU"],
  engagementType: "full-time",
  compensation: null,
  description: "Lead a team of 8. Kubernetes in production.",
  skills: [],
  companyMeta: {},
  sourceUrl: "https://example.invalid/1",
};

const fit: ModelScore = {
  overall: 82,
  skills_fit: 80,
  seniority_fit: 85,
  rate_fit: 50,
  location_fit: 90,
  engagement_fit: 80,
  rationale: "Your leadership evidence matches a Head of Engineering role well.",
  red_flags: [],
  service_lines: [],
  is_leadership: true,
  eligibility: { restricted_to: [], owner_eligible: true },
  company: { stage: "unknown", engineering_team_size: null },
};
const cv = {
  recommended: "tech-lead",
  reason: "The offer is a leadership role and this variant leads with team leadership.",
  gaps: ["Kubernetes"],
};

describe("CV variant recommendation in scoring", () => {
  it("adds no variants section and no cv field without variants", async () => {
    expect(buildScoringPrompt(base, offer)).not.toContain("CV variants");
    const client = new FakeLlmClient([fit]);
    const res = await scoreOfferWithModel({ client }, base, offer);
    expect(client.requests[0]?.schema).toBe(modelScoreSchema);
    expect(res.score.cv).toBeUndefined();
  });

  it("asks for a recommendation and keeps the master CV as the basis for fit", async () => {
    const prompt = buildScoringPrompt(withVariants, offer);
    expect(prompt.indexOf("Candidate CV (trusted):")).toBeLessThan(prompt.indexOf("CV variants"));
    expect(prompt).toContain("Judge every fit score from the master CV above");
    expect(prompt).toContain("[tech-lead] Tech Lead (use for: Lead and EM roles)");
    const client = new FakeLlmClient([{ ...fit, cv }]);
    const res = await scoreOfferWithModel({ client }, withVariants, offer);
    expect(client.requests[0]?.schema).toBe(modelScoreWithCvSchema);
    expect(res.score.cv).toEqual(cv);
  });

  it("truncates each variant and stops including text past the total budget", () => {
    const long = Array.from({ length: 8 }, (_, i) => ({
      id: `v${i}`,
      name: `Variant ${i}`,
      useFor: "x",
      text: "y".repeat(VARIANT_PROMPT_CHARS + 500),
    }));
    const block = cvVariantsBlock(long);
    const included = Math.floor(VARIANTS_PROMPT_TOTAL / VARIANT_PROMPT_CHARS);
    expect(block.match(/\[…truncated\]/g)).toHaveLength(included + 1);
    expect(block.match(/\(text not included\)/g)).toHaveLength(8 - included - 1);
    expect(block).toContain("[v7] Variant 7");
  });

  it("drops a recommendation naming an unknown variant and keeps the score", async () => {
    const client = new FakeLlmClient([{ ...fit, cv: { ...cv, recommended: "designer" } }]);
    const res = await scoreOfferWithModel({ client }, withVariants, offer);
    expect(res.score.cv).toBeUndefined();
    expect(res.score.overall).toBe(82);
  });

  it("the same fit gives the same scores with and without variants, and hard rules still apply", async () => {
    const plain = await scoreOfferWithModel({ client: new FakeLlmClient([fit]) }, base, offer);
    const rec = await scoreOfferWithModel(
      { client: new FakeLlmClient([{ ...fit, cv }]) },
      withVariants,
      offer,
    );
    const { cv: _cv, ...withoutCv } = rec.score;
    expect(withoutCv).toEqual(plain.score);
    expect(applyRules(rec.score, offer, base.preferences)).toEqual(
      applyRules(plain.score, offer, base.preferences),
    );

    const usOnly = { ...fit, eligibility: { restricted_to: ["US"], owner_eligible: false } };
    const capped = await scoreOfferWithModel(
      { client: new FakeLlmClient([{ ...usOnly, cv }]) },
      withVariants,
      offer,
    );
    expect(applyRules(capped.score, offer, base.preferences).overall).toBeLessThanOrEqual(30);
  });
});

import { describe, expect, it } from "vitest";
import {
  FakeLlmClient,
  draftApplication,
  emptyCompanyProfile,
  groundFigures,
  type ModelDraft,
  type OfferForLlm,
} from "../src/index";
import { loadSeedProfile } from "./seed-profile";

const profile = loadSeedProfile();

const offer: OfferForLlm = {
  title: "Senior AI Engineer",
  companyName: "Northwind",
  location: "Remote (EU)",
  remotePolicy: "remote",
  regions: ["EU"],
  engagementType: "contract",
  compensation: { min: 7000, max: 9000, currency: "EUR", period: "hour" },
  description:
    "Build agentic RAG for 12 enterprise clients. Screening: What latency reduction did you achieve in your last RAG project? Please share a metric.",
  skills: ["TypeScript", "RAG"],
  companyMeta: {},
  sourceUrl: "https://example.invalid/1",
};

const base: ModelDraft = {
  message:
    "Hi Northwind team, I led the frontend of Tailspin's agentic RAG analytics platform and took an AI-native platform from PoC to v1.0 as VP of Engineering. In that role I reduced latency by 37% and grew the team to 25 engineers. I would bring the same hands-on approach to your 12 enterprise clients.",
  screening_answers: [
    {
      question: "What latency reduction did you achieve in your last RAG project?",
      answer: "[metric: latency reduction in the Tailspin RAG platform]",
    },
  ],
  suggested_rate: { amount: 50, currency: "EUR", period: "hour", reasoning: "Market rate." },
  verify_before_sending: [],
  company_facts_used: [],
};

describe("draft grounding", () => {
  it("replaces a metric the CV does not contain with a placeholder, never a number", async () => {
    const client = new FakeLlmClient([base]);
    const { draft } = await draftApplication({ client }, profile, offer);
    expect(draft.message).toContain("[VERIFY: 37%]");
    expect(draft.message).toContain("[VERIFY: 25 engineers]");
    expect(draft.message).not.toMatch(/(?<!VERIFY: )37%/);
    // Facts from the offer itself are fine.
    expect(draft.message).toContain("your 12 enterprise clients");
    expect(draft.screening_answers[0]?.answer).toBe(
      "[metric: latency reduction in the Tailspin RAG platform]",
    );
    expect(draft.verify_before_sending).toEqual(
      expect.arrayContaining([
        'Unverified figure "37%" — not found in your CV or profile',
        'Unverified figure "25 engineers" — not found in your CV or profile',
        "Placeholder to fill: [metric: latency reduction in the Tailspin RAG platform]",
      ]),
    );
  });

  it("keeps the suggested rate at or above the owner's minimum", async () => {
    const client = new FakeLlmClient([base]);
    const { draft } = await draftApplication({ client }, profile, offer);
    expect(draft.suggested_rate).toMatchObject({ amount: 70, currency: "EUR", period: "hour" });
  });

  it("keeps grounded figures from the CV", () => {
    const g = groundFigures("10 years building web products, the last 4 shipping LLM features.", [
      profile.cv,
    ]);
    expect(g.replaced).toEqual([]);
  });

  it("uses the drafting model and kind, wraps the offer and passes the owner's instruction", async () => {
    const client = new FakeLlmClient([base]);
    await draftApplication({ client }, profile, offer, {
      instruction: "shorter, emphasize RAG",
      previousMessage: "old",
    });
    const req = client.requests[0]!;
    expect(req).toMatchObject({ kind: "drafting", model: "sonnet" });
    expect(req.prompt).toContain(
      "Owner's instruction for this version (trusted): shorter, emphasize RAG",
    );
    expect(req.prompt).toContain('<untrusted name="offer">');
    expect(req.system).toContain("use ONLY facts present in the CV or profile");
  });

  it("rejects messages over the word limit and retries", async () => {
    const long = { ...base, message: Array.from({ length: 260 }, () => "word").join(" ") };
    const client = new FakeLlmClient([long, base]);
    const { attempts } = await draftApplication({ client }, profile, offer);
    expect(attempts).toBe(2);
    expect(client.requests[1]?.prompt).toContain("at most 180 words");
  });
});

describe("company facts in drafts", () => {
  const PRESS = "https://news.example/northwind-series-b";
  const company = {
    profile: {
      ...emptyCompanyProfile(),
      funding: {
        value: {
          stage: "series-b" as const,
          last_round: "Series B",
          date: "2026-10",
          amount: "30 M EUR",
        },
        sources: [PRESS],
      },
    },
    researchedAt: new Date("2026-11-14T10:00:00Z"),
  };

  it("passes the profile, keeps its figures and lists only facts sourced in the profile", async () => {
    const client = new FakeLlmClient([
      {
        ...base,
        message:
          "Hi Northwind team, congratulations on the 30 M EUR Series B in October 2026. I led the frontend of Tailspin's agentic RAG analytics platform and would bring that to your 12 enterprise clients.",
        company_facts_used: [
          { fact: "Series B, October 2026", source: `${PRESS}#top` },
          { fact: "Acquired by Contoso", source: "https://rumours.example/x" },
        ],
      },
    ]);
    const { draft } = await draftApplication({ client }, profile, offer, { company });
    expect(client.requests[0]?.prompt).toContain("Company profile (facts from public sources");
    expect(draft.message).toContain("30 M EUR Series B");
    expect(draft.message).not.toContain("[VERIFY: 30");
    expect(draft.company_facts_used).toEqual([
      { fact: "Series B, October 2026", source: `${PRESS}#top` },
    ]);
  });

  it("drops every company fact when there is no profile", async () => {
    const client = new FakeLlmClient([
      { ...base, company_facts_used: [{ fact: "Series B", source: PRESS }] },
    ]);
    const { draft } = await draftApplication({ client }, profile, offer);
    expect(draft.company_facts_used).toEqual([]);
    expect(client.requests[0]?.prompt).not.toContain("Company profile");
  });
});

describe("drafts for a CV variant", () => {
  const variant = {
    id: "tech-lead",
    name: "Tech Lead",
    useFor: "Lead roles",
    // A variant may also carry a figure the master CV lacks; it is still not a grounded fact.
    text: "Leadership first. Grew a team to 23 engineers.",
  };
  const written = {
    ...base,
    message:
      "Hi Northwind team, 10 years building web products, the last 4 shipping LLM features. I grew a team to 23 engineers and would bring the same hands-on approach to your 12 enterprise clients.",
    screening_answers: [],
  };

  it("puts the variant to emphasize after the full CV, which stays the source of facts", async () => {
    const client = new FakeLlmClient([written]);
    await draftApplication({ client }, profile, offer, { cvVariant: variant });
    const prompt = client.requests[0]!.prompt;
    expect(prompt).toContain(
      "Full CV (trusted, the only source of facts; facts may come from here):",
    );
    expect(prompt).toContain('the "Tech Lead" version of the CV');
    expect(prompt.indexOf("Full CV")).toBeLessThan(prompt.indexOf("CV to emphasize"));
  });

  it("keeps facts from the master CV and flags ones found in neither the master CV nor the profile", async () => {
    const client = new FakeLlmClient([written]);
    const { draft } = await draftApplication({ client }, profile, offer, { cvVariant: variant });
    expect(draft.message).toContain("10 years building web products");
    expect(draft.message).toContain("[VERIFY: 23 engineers]");
  });

  it("without a variant the prompt is unchanged", async () => {
    const client = new FakeLlmClient([base]);
    await draftApplication({ client }, profile, offer);
    expect(client.requests[0]!.prompt).toContain(
      "Candidate CV (trusted, the only source of facts):",
    );
    expect(client.requests[0]!.prompt).not.toContain("CV to emphasize");
  });
});

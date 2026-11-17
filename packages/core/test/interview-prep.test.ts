import { describe, expect, it } from "vitest";
import {
  FakeLlmClient,
  LlmBudget,
  MemoryUsageStore,
  SAMPLE_INTERVIEW_PREP,
  emptyCompanyProfile,
  groundInterviewPrep,
  isInterviewStage,
  prepareInterview,
} from "../src";
import { loadSeedProfile } from "./seed-profile";

describe("isInterviewStage", () => {
  it("knows built-in interview stages and custom ones by label", () => {
    expect(isInterviewStage("technical_interview")).toBe(true);
    expect(isInterviewStage("applied")).toBe(false);
    expect(isInterviewStage("custom_1", "Entrevista con el CEO")).toBe(true);
    expect(isInterviewStage("custom_2", "Contract review")).toBe(false);
  });
});

describe("groundInterviewPrep", () => {
  it("marks figures missing from the CV and lists placeholders to prepare", () => {
    const plan = groundInterviewPrep(
      {
        ...SAMPLE_INTERVIEW_PREP,
        likely_questions: [
          {
            question: "Impact?",
            why_they_ask: "Seniority",
            answer_outline: [
              "Cut latency by 40%",
              "Led 6 engineers",
              "[example: an incident you led]",
            ],
          },
        ],
      },
      ["I led 6 engineers on a RAG platform."],
      "",
    );
    const outline = plan.likely_questions[0]!.answer_outline;
    expect(outline[0]).toContain("[VERIFY: 40%]");
    expect(outline[1]).toBe("Led 6 engineers");
    expect(plan.verify).toContain('Unverified figure "40%" — not found in your CV');
    expect(plan.verify).toContain("Prepare: [example: an incident you led]");
  });
});

describe("prepareInterview", () => {
  it("uses the drafting model and budget, with the stage and interview in the prompt", async () => {
    const client = new FakeLlmClient([SAMPLE_INTERVIEW_PREP]);
    const budget = new LlmBudget(new MemoryUsageStore(), () => ({ scoring: 10, drafts: 10 }));
    const profile = loadSeedProfile();
    const res = await prepareInterview(
      { client, budget },
      profile,
      {
        title: "AI Engineer",
        companyName: "Contoso",
        remotePolicy: "remote",
        regions: ["EU"],
        engagementType: "full_time",
        compensation: null,
        description: "Agentic RAG with TypeScript.",
        skills: ["TypeScript"],
        companyMeta: {},
        sourceUrl: "https://jobs.example.invalid/1",
      },
      {
        stage: "technical_interview",
        stageLabel: "Technical interview",
        interview: {
          type: "technical",
          scheduledAt: "2030-03-12T15:30:00.000Z",
          durationMinutes: 60,
          interviewers: ["CTO"],
        },
      },
    );
    const req = client.requests[0];
    expect(req?.kind).toBe("drafting");
    expect(req?.model).toBe(profile.preferences.scoring.models.drafting);
    expect(req?.prompt).toContain("Round to prepare: Technical interview");
    expect(req?.prompt).toContain("with CTO");
    expect(res.plan.likely_questions).toHaveLength(3);
    expect(budget.used("drafting")).toBe(1);
    expect(res.plan.company_context).toEqual({ unavailable: "No company research available" });
  });

  it("adds a sourced Company context from the research profile", async () => {
    const LAUNCH = "https://contoso.example/blog/route-ai";
    const client = new FakeLlmClient([SAMPLE_INTERVIEW_PREP]);
    const offer = {
      title: "AI Engineer",
      companyName: "Contoso",
      remotePolicy: "remote" as const,
      regions: [],
      engagementType: "full_time",
      compensation: null,
      description: "Agentic RAG.",
      skills: [],
      companyMeta: {},
      sourceUrl: "https://jobs.example.invalid/1",
    };
    const res = await prepareInterview({ client }, loadSeedProfile(), offer, {
      stage: "technical_interview",
      stageLabel: "Technical interview",
      company: {
        profile: {
          ...emptyCompanyProfile(),
          product: { value: "Route planning AI for fleets", sources: [LAUNCH] },
          funding: {
            value: {
              stage: "series-a",
              last_round: "Series A",
              date: "2026-03",
              amount: "12 M EUR",
            },
            sources: ["https://news.example/contoso"],
          },
          news: [{ date: "2026-10", headline: "Contoso launches Route AI", source: LAUNCH }],
        },
        researchedAt: new Date("2026-11-10T09:00:00Z"),
      },
    });
    expect(client.requests[0]?.prompt).toContain("Contoso launches Route AI");
    expect(res.plan.company_context).toMatchObject({
      product: { text: "Route planning AI for fleets", source: LAUNCH },
      stage: {
        text: "series a, last round Series A, 12 M EUR (2026-03)",
        source: "https://news.example/contoso",
      },
      news: [{ headline: "Contoso launches Route AI", source: LAUNCH }],
    });
  });
});

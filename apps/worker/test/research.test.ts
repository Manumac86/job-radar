import {
  FakeLlmClient,
  FakeResearchClient,
  LlmBudget,
  LlmUnavailableError,
  SAMPLE_INTERVIEW_PREP,
  SAMPLE_RESEARCH,
  emptyCompanyProfile,
  normalizeSourceUrl,
  type ModelScore,
} from "@job-radar/core";
import {
  createApplication,
  currentCompanyResearch,
  moveStage,
  getOffer,
  latestCompanyResearch,
  llmUsageStore,
  scoreHistory,
  upsertSource,
} from "@job-radar/db";
import type { PageReader } from "@job-radar/sources";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { ingestOffers } from "../src/ingest/pipeline";
import { Notifier } from "../src/notifier";
import { PrepService } from "../src/pipeline/prep";
import { CAP_WAIT_MESSAGE, ResearchService } from "../src/research/service";
import { ScoringService } from "../src/scoring/service";
import { testContext } from "./helpers";

function fakeReader(): PageReader {
  const readUrls = new Set<string>();
  return {
    readUrls,
    async read(url) {
      if (!url.startsWith("https://"))
        throw new Error("Local and private network addresses are refused");
      readUrls.add(normalizeSourceUrl(url)!);
      return { url, title: "Page", text: "Company page", truncated: false };
    },
  };
}

const leadershipScore = (): ModelScore => ({
  overall: 85,
  skills_fit: 85,
  seniority_fit: 85,
  rate_fit: 50,
  location_fit: 85,
  engagement_fit: 80,
  rationale: "Strong leadership fit.",
  red_flags: [],
  service_lines: [],
  is_leadership: true,
  eligibility: { restricted_to: [], owner_eligible: true },
  company: { stage: "unknown", engineering_team_size: null },
});

function setup(opts: { cap?: number; research?: FakeResearchClient } = {}) {
  const ctx = testContext();
  const notifier = new Notifier(ctx.db);
  const client = new FakeLlmClient([], () => leadershipScore());
  const budget = new LlmBudget(llmUsageStore(ctx.db), () => ({
    scoring: 100,
    drafts: 10,
    research: opts.cap ?? 10,
  }));
  const researchClient = opts.research ?? new FakeResearchClient([], SAMPLE_RESEARCH);
  const scoring = new ScoringService({
    db: ctx.db,
    profile: ctx.profile,
    client,
    budget,
    notifier,
  });
  const research = new ResearchService({
    db: ctx.db,
    profile: ctx.profile,
    research: researchClient,
    client,
    budget,
    newReader: fakeReader,
  });
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby", enabled: true });
  const [offerId] = ingestOffers(
    ctx.db,
    "ashby",
    [
      {
        sourceId: "ashby",
        externalId: `lead-${Math.random()}`,
        sourceUrl: "https://jobs.ashbyhq.com/acme/1",
        title: "Head of Engineering",
        companyName: "Acme Robotics",
        companyWebsite: "https://acme.example",
        remotePolicy: "remote",
        description: "Lead our engineering team.",
      },
    ],
    ctx.profile.get()!.preferences,
  ).newOfferIds;
  const offer = getOffer(ctx.db, offerId!)!;
  const app = createApp({ ...ctx, research, scoring });
  return { ...ctx, client, budget, scoring, research, researchClient, offer, app };
}

describe("ResearchService", () => {
  it("refuses to research an unknown company (simpleapply-dover-fixes D2)", () => {
    const s = setup();
    const [id] = ingestOffers(
      s.db,
      "ashby",
      [
        {
          sourceId: "ashby",
          externalId: "unknown-co",
          sourceUrl: "https://jobs.ashbyhq.com/x/2",
          title: "Platform Engineer",
          companyName: "Unknown company",
          remotePolicy: "remote",
          description: "Platform work.",
        },
      ],
      s.profile.get()!.preferences,
      new Date(),
      () => {},
      { prefilter: false },
    ).newOfferIds;
    const offer = getOffer(s.db, id!)!;
    expect(() => s.research.request(offer.companyId!, { reason: "manual" })).toThrow(
      "The company of this offer is unknown",
    );
  });

  it("researches a company, stores a grounded profile and reuses it while fresh", async () => {
    const s = setup();
    const res = await request(s.app)
      .post(`/companies/${s.offer.companyId}/research`)
      .send({ offerId: s.offer.id });
    expect(res.status).toBe(202);
    await s.research.idle();
    const row = currentCompanyResearch(s.db, s.offer.companyId!);
    expect(row?.status).toBe("done");
    const profile = row?.profile as ReturnType<typeof emptyCompanyProfile>;
    expect(profile.funding?.value.last_round).toBe("Series B");
    expect(profile.headcount).toBeNull(); // cited a page that was never read
    expect(row?.readUrls).toEqual(["https://acme.example"]);
    expect(s.researchClient.requests[0]?.prompt).toContain(
      "Hosts seen on the offer: jobs.ashbyhq.com",
    );

    const again = await request(s.app).post(`/companies/${s.offer.companyId}/research`);
    expect(again.body).toMatchObject({ outcome: "fresh" });
    const forced = await request(s.app).post(`/companies/${s.offer.companyId}/research?force=1`);
    expect(forced.body).toMatchObject({ outcome: "queued" });
    await s.research.idle();
    expect(s.researchClient.requests).toHaveLength(2);
    expect(s.budget.used("research")).toBe(2);
  });

  it("refuses manual research at the cap and queues triggered research for tomorrow", async () => {
    const s = setup({ cap: 0 });
    const manual = await request(s.app).post(`/companies/${s.offer.companyId}/research`);
    expect(manual.status).toBe(429);
    expect(manual.body.error).toMatch(/Daily research limit of 0 reached/);
    const shortlist = await request(s.app).post(
      `/companies/${s.offer.companyId}/research?reason=shortlist`,
    );
    expect(shortlist.status).toBe(202);
    expect(latestCompanyResearch(s.db, s.offer.companyId!)).toMatchObject({
      status: "queued",
      error: CAP_WAIT_MESSAGE,
    });
    expect(s.research.sweep()).toBe(0);
    expect(s.researchClient.requests).toHaveLength(0);
  });

  it("shows why research failed and lets the owner retry", async () => {
    const research = new FakeResearchClient([
      new LlmUnavailableError("not logged in", "not_authenticated"),
      SAMPLE_RESEARCH,
    ]);
    const s = setup({ research });
    s.research.request(s.offer.companyId!, { reason: "manual" });
    await s.research.idle();
    const state = await request(s.app).get(`/companies/${s.offer.companyId}/research`);
    expect(state.body).toMatchObject({
      state: "failed",
      latest: { error: "Claude Code CLI not logged in" },
    });
    s.research.request(s.offer.companyId!, { reason: "manual" });
    await s.research.idle();
    expect(s.research.state(s.offer.companyId!).state).toBe("done");
  });

  it("rescores the company's open offers with the profile: stage above target", async () => {
    const research = new FakeResearchClient([
      async (_req, tools) => {
        await tools.readPage("https://acme.example/about");
        return {
          ...emptyCompanyProfile(),
          website: "https://acme.example",
          funding: {
            value: { stage: "later", last_round: "Series D", date: "2026-06", amount: "120 M USD" },
            sources: ["https://acme.example/about"],
          },
          engineering_team_size: { value: 400, sources: ["https://acme.example/about"] },
        };
      },
    ]);
    const s = setup({ research });
    await s.scoring.scoreOne(s.offer.id);
    expect(scoreHistory(s.db, s.offer.id)[0]?.redFlags).not.toContain("company stage above target");

    s.research.onFinished((row) => {
      s.scoring.enqueue([s.offer.id].filter(() => row.companyId === s.offer.companyId));
    });
    s.research.request(s.offer.companyId!, { offerId: s.offer.id, reason: "manual" });
    await s.research.idle();
    await s.scoring.idle();
    const latest = scoreHistory(s.db, s.offer.id)[0];
    expect(latest?.redFlags).toContain("company stage above target");
    const scoringPrompt = s.client.requests.at(-1)?.prompt ?? "";
    expect(scoringPrompt).toContain("Company profile (facts from public sources");
    expect(scoringPrompt).toContain("Series D");
  });

  it("waits for research when interview prep asks for a fresh profile", async () => {
    const s = setup();
    const row = await s.research.freshProfile(s.offer.companyId!, s.offer.id, 5_000);
    expect(row?.status).toBe("done");
    expect(s.researchClient.requests).toHaveLength(1);
    expect((await s.research.freshProfile(s.offer.companyId!, s.offer.id))?.id).toBe(row?.id);
    expect(s.researchClient.requests).toHaveLength(1);
  });

  it("interview prep researches first and adds a sourced Company context", async () => {
    const s = setup();
    const app = createApplication(s.db, { offerId: s.offer.id });
    moveStage(s.db, app.id, "technical_interview");
    const prepClient = new FakeLlmClient([SAMPLE_INTERVIEW_PREP]);
    const prep = new PrepService({
      db: s.db,
      profile: s.profile,
      client: prepClient,
      budget: s.budget,
      research: s.research,
    });
    const plan = (await prep.generate(app.id)).plan;
    expect(plan.company_context).toMatchObject({
      product: { source: "https://acme.example" },
      news: [{ headline: "Acme Robotics raises a 30 M EUR Series B" }],
    });
    expect(prepClient.requests[0]?.prompt).toContain("Company profile (facts from public sources");
  });

  it("interview prep goes on without research and says so", async () => {
    const s = setup({ cap: 0 });
    const app = createApplication(s.db, { offerId: s.offer.id });
    const prep = new PrepService({
      db: s.db,
      profile: s.profile,
      client: new FakeLlmClient([SAMPLE_INTERVIEW_PREP]),
      budget: s.budget,
      research: s.research,
    });
    const plan = (await prep.generate(app.id)).plan;
    expect(plan.company_context).toEqual({ unavailable: "Company research unavailable" });
  });
});

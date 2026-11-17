import { FakeLlmClient, LlmBudget, type ModelDraft, type ModelScore } from "@job-radar/core";
import { listDrafts, llmUsageStore, offerTimeline, upsertSource } from "@job-radar/db";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { DraftService } from "../src/drafts/service";
import { ingestOffers } from "../src/ingest/pipeline";
import { Notifier } from "../src/notifier";
import { ScoringService } from "../src/scoring/service";
import { testContext } from "./helpers";

const draft = (message: string): ModelDraft => ({
  message,
  screening_answers: [],
  suggested_rate: { amount: 90, currency: "EUR", period: "hour", reasoning: "Within your target." },
  verify_before_sending: [],
  company_facts_used: [],
});

const score = (overall: number): ModelScore => ({
  overall,
  skills_fit: 90,
  seniority_fit: 85,
  rate_fit: 70,
  location_fit: 90,
  engagement_fit: 85,
  rationale: "Strong fit with your agentic RAG experience.",
  red_flags: [],
  service_lines: ["agentic-rag"],
  is_leadership: false,
  eligibility: { restricted_to: [], owner_eligible: true },
  company: { stage: "seed", engineering_team_size: 8 },
});

function setup(responses: unknown[]) {
  const ctx = testContext();
  const client = new FakeLlmClient(responses);
  const budget = new LlmBudget(llmUsageStore(ctx.db), () => ({ scoring: 100, drafts: 2 }));
  const notifier = new Notifier(ctx.db);
  const scoring = new ScoringService({
    db: ctx.db,
    profile: ctx.profile,
    client,
    budget,
    notifier,
  });
  const drafts = new DraftService({ db: ctx.db, profile: ctx.profile, client, budget });
  scoring.onScored((offer, s) => {
    if (s.scoreClass === "strong") return drafts.autoDraft(offer.id).then(() => undefined);
  });
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby" });
  const [offerId] = ingestOffers(
    ctx.db,
    "ashby",
    [
      {
        sourceId: "ashby",
        externalId: "1",
        sourceUrl: "https://jobs.example.invalid/1",
        title: "Senior AI Engineer",
        companyName: "Northwind",
        remotePolicy: "remote",
        description: "Agentic RAG with TypeScript.",
      },
    ],
    ctx.profile.get()!.preferences,
  ).newOfferIds;
  const app = createApp({ db: ctx.db, profile: ctx.profile, scoring, drafts });
  return { ...ctx, client, scoring, drafts, app, offerId: offerId! };
}

const long =
  "I led the frontend of Tailspin's agentic RAG analytics platform and would love to help Northwind ship its assistant.";

describe("drafts API", () => {
  it("auto-drafts a strong match right after it is scored", async () => {
    const s = setup([score(86), draft(long)]);
    s.scoring.enqueue([s.offerId]);
    await s.scoring.idle();
    await s.drafts.idle();
    const versions = listDrafts(s.db, s.offerId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, model: "sonnet", instruction: null });
    expect(offerTimeline(s.db, s.offerId).map((e) => e.kind)).toContain("draft_created");
  });

  it("regenerates with an instruction as a new version and keeps earlier ones", async () => {
    const s = setup([draft(long), draft(`Shorter: ${long}`)]);
    await request(s.app).post(`/offers/${s.offerId}/drafts`).send({}).expect(201);
    const res = await request(s.app)
      .post(`/offers/${s.offerId}/drafts`)
      .send({ instruction: "shorter, emphasize RAG" })
      .expect(201);
    expect(res.body).toMatchObject({ version: 2, instruction: "shorter, emphasize RAG" });
    expect(s.client.requests[1]?.prompt).toContain(
      "Owner's instruction for this version (trusted): shorter, emphasize RAG",
    );
    expect(s.client.requests[1]?.prompt).toContain(`Previous draft (for reference):\n${long}`);
    const list = await request(s.app).get(`/offers/${s.offerId}/drafts`).expect(200);
    expect(list.body.map((d: { version: number }) => d.version)).toEqual([2, 1]);
  });

  it("returns 429 when the daily draft cap is used up, and 404 for unknown offers", async () => {
    const s = setup([draft(long), draft(long)]);
    await request(s.app).post(`/offers/${s.offerId}/drafts`).send({}).expect(201);
    await request(s.app).post(`/offers/${s.offerId}/drafts`).send({}).expect(201);
    const capped = await request(s.app).post(`/offers/${s.offerId}/drafts`).send({}).expect(429);
    expect(capped.body.error).toMatch(/Daily drafting cap of 2/);
    await request(s.app).post("/offers/9999/drafts").send({}).expect(404);
    await request(s.app).post(`/offers/${s.offerId}/drafts`).send({ instruction: 5 }).expect(400);
  });
});

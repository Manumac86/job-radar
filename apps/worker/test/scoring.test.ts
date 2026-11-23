import {
  FakeLlmClient,
  LlmBudget,
  LlmUnavailableError,
  MemoryUsageStore,
  type ModelScore,
} from "@job-radar/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createApplication,
  createLearnedPreference,
  setTriage,
  staleCvRecommendationCount,
  getOffer,
  setLearnedStatus,
  listNotifications,
  scoreHistory,
  upsertSource,
  llmUsageStore,
} from "@job-radar/db";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { ingestOffers } from "../src/ingest/pipeline";
import { Notifier } from "../src/notifier";
import { ScoringService } from "../src/scoring/service";
import { testContext } from "./helpers";

const score = (overall: number, extra: Partial<ModelScore> = {}): ModelScore => ({
  overall,
  skills_fit: 80,
  seniority_fit: 80,
  rate_fit: 50,
  location_fit: 80,
  engagement_fit: 80,
  rationale: "Good overlap with the owner's agentic RAG work.",
  red_flags: [],
  service_lines: ["agentic-rag"],
  is_leadership: false,
  eligibility: { restricted_to: [], owner_eligible: true },
  company: { stage: "unknown", engineering_team_size: null },
  ...extra,
});

function setup(
  responses: unknown[],
  caps = { scoring: 100, drafts: 10 },
  fallback?: () => unknown,
) {
  const ctx = testContext();
  const notifier = new Notifier(ctx.db);
  const client = new FakeLlmClient(responses, fallback);
  const budget = new LlmBudget(
    llmUsageStore(ctx.db),
    () => caps,
    (e) =>
      notifier.notify({
        kind: "llm_cap_reached",
        title: "cap",
        body: e.day,
        dedupeKey: `cap:${e.group}:${e.day}`,
      }),
  );
  const scoring = new ScoringService({
    db: ctx.db,
    profile: ctx.profile,
    client,
    budget,
    notifier,
  });
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby", enabled: true });
  const ingest = (n: number, extra: Record<string, unknown> = {}) =>
    ingestOffers(
      ctx.db,
      "ashby",
      Array.from({ length: n }, (_, i) => ({
        sourceId: "ashby",
        externalId: `o${i}-${Math.random()}`,
        sourceUrl: `https://jobs.example.invalid/${i}`,
        title: `AI Engineer ${i}`,
        companyName: `Company ${i} ${Math.random()}`,
        remotePolicy: "remote" as const,
        description: "Agentic RAG with TypeScript.",
        ...extra,
      })),
      ctx.profile.get()!.preferences,
    ).newOfferIds;
  return { ...ctx, notifier, client, budget, scoring, ingest };
}

describe("learned preferences in scoring", () => {
  it("sends only active preferences and keeps the hard cap", async () => {
    const s = setup([
      score(95, { red_flags: ["Matches what you avoid: crypto and web3 companies"] }),
    ]);
    createLearnedPreference(s.db, { text: "Avoid crypto and web3 companies", polarity: "avoid" });
    const off = createLearnedPreference(s.db, { text: "Avoid agencies", polarity: "avoid" });
    setLearnedStatus(s.db, off.id, "disabled");
    createLearnedPreference(s.db, { text: "Prefer US-based startups", polarity: "prefer" });
    const [id] = s.ingest(1, { location: "Remote (US) · US citizen/visa only" });
    s.scoring.enqueue([id!]);
    await s.scoring.idle();
    const prompt = s.client.requests[0]!.prompt;
    expect(prompt).toContain("[avoid] Avoid crypto and web3 companies");
    expect(prompt).toContain("[prefer] Prefer US-based startups");
    expect(prompt).not.toContain("Avoid agencies");
    expect(s.client.requests[0]!.system).toContain("Matches what you avoid");
    // A prefer match never lifts an ineligible offer above the cap.
    expect(getOffer(s.db, id!)).toMatchObject({ score: 30 });
    expect(scoreHistory(s.db, id!)[0]!.redFlags).toContain(
      "Matches what you avoid: crypto and web3 companies",
    );
  });

  it("omits the block when nothing is learned", async () => {
    const s = setup([score(80)]);
    const [id] = s.ingest(1);
    s.scoring.enqueue([id!]);
    await s.scoring.idle();
    expect(s.client.requests[0]!.prompt).not.toContain("learned preferences");
  });
});

describe("scoring service", () => {
  it("scores new offers, applies hard rules and classifies them", async () => {
    const s = setup([score(85), score(90)]);
    const [a, b] = s.ingest(2);
    const usOnly = s.ingest(1, { location: "Remote (US) · US citizen/visa only" });
    s.client.push(score(92));
    s.scoring.enqueue([a!, b!, ...usOnly]);
    await s.scoring.idle();
    expect(getOffer(s.db, a!)).toMatchObject({
      scoreStatus: "scored",
      score: 85,
      scoreClass: "strong",
    });
    const capped = getOffer(s.db, usOnly[0]!)!;
    expect(capped).toMatchObject({ score: 30, scoreClass: "weak" });
    expect(scoreHistory(s.db, usOnly[0]!)[0]).toMatchObject({
      modelOverall: 92,
      redFlags: ["US residency required"],
    });
    expect(s.client.requests.every((r) => r.kind === "scoring" && r.model === "haiku")).toBe(true);
  });

  it("adds the preferred-region bonus and stores it with the score", async () => {
    const s = setup([score(74), score(74)]);
    const file = join(s.profile.status().dir, "preferences.yaml");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace("preferred_regions: []", "preferred_regions: [Spain]"),
    );
    s.profile.reload();
    const [spain] = s.ingest(1, { location: "Remote", regions: ["Spain", "Portugal"] });
    const [other] = s.ingest(1, { location: "Remote (Germany)" });
    s.scoring.enqueue([spain!, other!]);
    await s.scoring.idle();
    expect(getOffer(s.db, spain!)).toMatchObject({ score: 79 });
    expect(scoreHistory(s.db, spain!)[0]).toMatchObject({
      modelOverall: 74,
      regionBonus: 5,
      preferredRegion: "Spain",
    });
    expect(scoreHistory(s.db, other!)[0]).toMatchObject({ regionBonus: 0, preferredRegion: null });
    expect(s.client.requests[0]!.prompt).toMatch(/preferred_regions/);
  });

  it("keeps score history after 'Rescore open offers'", async () => {
    const s = setup([score(70)]);
    const [id] = s.ingest(1);
    s.scoring.enqueue([id!]);
    await s.scoring.idle();
    s.client.push(score(82));
    const app = createApp({ db: s.db, profile: s.profile, scoring: s.scoring });
    await request(app).post("/scoring/rescore-open").expect(202, { queued: 1 });
    await s.scoring.idle();
    expect(scoreHistory(s.db, id!).map((h) => h.overall)).toEqual([82, 70]);
    expect(getOffer(s.db, id!)?.scoreClass).toBe("strong");
  });

  it("leaves offers awaiting score when the daily cap is reached and notifies once", async () => {
    const s = setup([], { scoring: 2, drafts: 1 }, () => score(75));
    const ids = s.ingest(4);
    s.scoring.enqueue(ids);
    await s.scoring.idle();
    const statuses = ids.map((id) => getOffer(s.db, id)!.scoreStatus);
    expect(statuses.filter((x) => x === "scored")).toHaveLength(2);
    expect(statuses.filter((x) => x === "awaiting_score")).toHaveLength(2);
    expect(s.scoring.isPaused()).toBe(true);
    expect(s.scoring.sweep()).toBe(0);
    expect(listNotifications(s.db).filter((n) => n.kind === "llm_cap_reached")).toHaveLength(1);
  });

  it("pauses with 'awaiting score' and notifies when the CLI is not logged in", async () => {
    const s = setup([
      new LlmUnavailableError("Claude Code CLI is not authenticated.", "not_authenticated"),
    ]);
    const [id] = s.ingest(1);
    s.scoring.enqueue([id!]);
    await s.scoring.idle();
    expect(getOffer(s.db, id!)?.scoreStatus).toBe("awaiting_score");
    expect(s.scoring.status()).toMatchObject({ llm: "not_authenticated" });
    expect(listNotifications(s.db)[0]?.kind).toBe("llm_unavailable");
  });

  it("marks 'scoring failed' after two invalid answers and allows a manual retry", async () => {
    const s = setup([{ overall: "great" }, { nope: true }]);
    const [id] = s.ingest(1);
    s.scoring.enqueue([id!]);
    await s.scoring.idle();
    expect(getOffer(s.db, id!)).toMatchObject({ scoreStatus: "scoring_failed" });
    expect(getOffer(s.db, id!)?.scoreError).toMatch(/failed validation twice/);
    s.client.push(score(64));
    const app = createApp({ db: s.db, profile: s.profile, scoring: s.scoring });
    await request(app).post(`/offers/${id}/score`).expect(202);
    await s.scoring.idle();
    expect(getOffer(s.db, id!)).toMatchObject({ scoreStatus: "scored", scoreClass: "possible" });
  });

  it("budget usage is stored per day", () => {
    const s = setup([]);
    s.budget.record({ kind: "scoring", model: "haiku", ok: true });
    expect(new MemoryUsageStore().count("x", ["scoring"])).toBe(0);
    expect(s.budget.used("scoring")).toBe(1);
  });
});

describe("CV variant recommendations", () => {
  const writeVariant = (dir: string) => {
    mkdirSync(join(dir, "cvs"), { recursive: true });
    writeFileSync(
      join(dir, "cvs", "tech-lead.md"),
      "---\nname: Tech Lead\nuse_for: Lead roles\n---\nLed a team of 6.\n",
    );
  };

  it("stores the recommendation, gaps and the variants hash with the score", async () => {
    const s = setup([
      score(82, { cv: { recommended: "tech-lead", reason: "Leadership role.", gaps: ["Go"] } }),
    ]);
    writeVariant(s.profile.dir);
    s.profile.reload();
    const [id] = s.ingest(1);
    s.scoring.enqueue([id!]);
    await s.scoring.idle();
    expect(s.client.requests[0]!.prompt).toContain("[tech-lead] Tech Lead");
    expect(scoreHistory(s.db, id!)[0]).toMatchObject({
      recommendedCv: "tech-lead",
      cvReason: "Leadership role.",
      cvGaps: ["Go"],
      cvVariantsHash: s.profile.variantsHash(),
    });
    expect(staleCvRecommendationCount(s.db, s.profile.variantsHash())).toBe(0);
  });

  it("refresh queues only shortlisted offers without an application, within the cap", async () => {
    const s = setup([], { scoring: 4, drafts: 1 }, () => score(75));
    const ids = s.ingest(5);
    s.scoring.enqueue(ids);
    await s.scoring.idle(); // 4 scored, 1 waits for the cap
    const [a, b, c, d] = ids as [number, number, number, number];
    for (const id of [a, b, c]) setTriage(s.db, id, "shortlisted");
    createApplication(s.db, { offerId: c });
    writeVariant(s.profile.dir);
    s.profile.reload();
    expect(staleCvRecommendationCount(s.db, s.profile.variantsHash())).toBe(2);

    const app = createApp({ db: s.db, profile: s.profile, scoring: s.scoring });
    await request(app).post("/scoring/refresh-cv").expect(202, { queued: 2 });
    await s.scoring.idle();
    // The cap was already used: both wait as "awaiting score"; d and c are untouched.
    expect([a, b].map((id) => getOffer(s.db, id)!.scoreStatus)).toEqual([
      "awaiting_score",
      "awaiting_score",
    ]);
    expect(getOffer(s.db, c)!.scoreStatus).toBe("scored");
    expect(getOffer(s.db, d)!.scoreStatus).toBe("scored");
  });
});

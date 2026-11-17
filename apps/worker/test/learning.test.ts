import { FakeLlmClient, LlmBudget, MemoryUsageStore } from "@job-radar/core";
import {
  activeLearnedPreferences,
  createLearnedPreference,
  editLearnedPreference,
  learningState,
  listNotifications,
  pendingFeedback,
  pendingSuggestions,
  rescoreSuggested,
  setLearnedStatus,
  setTriage,
} from "@job-radar/db";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { LearningService, LEARNING_THRESHOLD } from "../src/learning/service";
import { createApp } from "../src/app";
import { Notifier } from "../src/notifier";
import { seedScoredOffer, testContext } from "./helpers";

function setup(responses: unknown[] = [], caps = { scoring: 10, drafts: 10 }) {
  const ctx = testContext();
  const client = new FakeLlmClient(responses);
  const budget = new LlmBudget(new MemoryUsageStore(), () => caps);
  const notifier = new Notifier(ctx.db);
  const learning = new LearningService({
    db: ctx.db,
    profile: ctx.profile,
    client,
    budget,
    notifier,
  });
  return { ...ctx, client, budget, notifier, learning };
}

type S = ReturnType<typeof setup>;

function dismiss(s: S, n: number, reasons = ["company"], note: string | null = "crypto") {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const { offer } = seedScoredOffer(s);
    setTriage(s.db, offer.id, "dismissed", null, { reasons, note });
    ids.push(offer.id);
  }
  return ids;
}

const ops = (add: { text: string; polarity: "avoid" | "prefer"; evidence: number[] }[]) => ({
  add,
  update: [],
  retire: [],
});

describe("LearningService", () => {
  it("waits for the threshold, then learns and notifies", async () => {
    const s = setup();
    const first = dismiss(s, LEARNING_THRESHOLD - 1);
    expect(await s.learning.feedbackAdded()).toBeNull();
    expect(s.client.requests).toHaveLength(0);

    const last = dismiss(s, 1);
    s.client.push(
      ops([
        {
          text: "Avoid crypto and web3 companies",
          polarity: "avoid",
          evidence: [...first, ...last],
        },
      ]),
    );
    const res = await s.learning.feedbackAdded();
    expect(res).toMatchObject({ ran: true, added: ["Avoid crypto and web3 companies"] });
    expect(activeLearnedPreferences(s.db)[0]?.evidence).toHaveLength(LEARNING_THRESHOLD);
    expect(pendingFeedback(s.db)).toEqual([]);
    expect(rescoreSuggested(s.db)).toBe(true);
    const n = listNotifications(s.db).find((x) => x.kind === "learned_preferences");
    expect(n?.title).toBe("Job Radar learned 1 new preference");
  });

  it("learns on demand below the threshold and sends counterexamples", async () => {
    const s = setup([ops([])]);
    dismiss(s, 2);
    const kept = seedScoredOffer(s).offer;
    setTriage(s.db, kept.id, "shortlisted");
    const res = await s.learning.run("manual");
    expect(res).toMatchObject({ ran: true, added: [] });
    expect(s.client.requests[0]?.prompt).toContain(`Offer #${kept.id}: shortlisted`);
    expect(learningState(s.db).changedAt).toBeNull();
  });

  it("does nothing without new feedback", async () => {
    const s = setup();
    expect(await s.learning.run("manual")).toEqual({
      ran: false,
      reason: "Nothing new to learn from",
    });
    expect(await s.learning.daily()).toBeNull();
  });

  it("keeps feedback pending when the budget is used up", async () => {
    const s = setup([], { scoring: 0, drafts: 10 });
    dismiss(s, 2);
    const res = await s.learning.run("manual");
    expect(res.ran).toBe(false);
    expect(s.client.requests).toHaveLength(0);
    expect(pendingFeedback(s.db)).toHaveLength(2);
  });

  it("never changes owner preferences or re-creates rejected ones", async () => {
    const s = setup();
    const ids = dismiss(s, 2);
    const owner = createLearnedPreference(s.db, {
      text: "Avoid crypto companies",
      polarity: "avoid",
    });
    editLearnedPreference(s.db, owner.id, { text: "Avoid crypto unless AI", polarity: "avoid" });
    const rejected = createLearnedPreference(s.db, { text: "Avoid agencies", polarity: "avoid" });
    setLearnedStatus(s.db, rejected.id, "disabled");
    s.client.push({
      add: [{ text: "Avoid agencies", polarity: "avoid", evidence: ids }],
      update: [{ id: owner.id, text: "Avoid everything", evidence: ids }],
      retire: [owner.id],
    });
    const res = await s.learning.run("manual");
    expect(res).toMatchObject({ ran: true, added: [], updated: 0, retired: 0, dropped: 2 });
    expect(activeLearnedPreferences(s.db).map((p) => p.text)).toEqual(["Avoid crypto unless AI"]);
  });

  it("suggests a higher minimum rate after two salary dismissals above it", () => {
    const s = setup();
    // Seed offers state 90 EUR/h; the seed profile's EUR minimum is 65.
    dismiss(s, 2, ["salary"], null);
    expect(s.learning.refreshSuggestions()).toBe(1);
    expect(pendingSuggestions(s.db)).toMatchObject([
      { kind: "raise_min_hourly", currency: "EUR", value: 90 },
    ]);
    expect(s.learning.refreshSuggestions()).toBe(0);
  });
});

describe("learning routes", () => {
  it("runs on demand and accepts feedback pings", async () => {
    const s = setup([ops([])]);
    dismiss(s, 1);
    const app = createApp({ ...s, learning: s.learning });
    const run = await request(app).post("/learning/run");
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ ran: true });
    const ping = await request(app).post("/learning/feedback-added");
    expect(ping.status).toBe(202);
    expect(await request(createApp(testContext())).post("/learning/run")).toMatchObject({
      status: 503,
    });
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationsDir } from "../src/paths";
import { createApplication } from "../src/queries/applications";
import {
  activeLearnedPreferences,
  countPendingDismissals,
  createLearnedPreference,
  currentDismissal,
  decideSuggestion,
  editLearnedPreference,
  learningState,
  listLearnedPreferences,
  markFeedbackLearned,
  pendingFeedback,
  pendingSuggestions,
  positiveSignals,
  rescoreSuggested,
  salaryDismissals,
  setLearnedStatus,
  updateLearnedByRun,
  updateLearningState,
  upsertSuggestion,
} from "../src/queries/learning";
import { getOffer, setTriage } from "../src/queries/offers";
import { offerFeedback } from "../src/schema";
import { memoryDb, seedOffer, seedSource } from "./helpers";

function setup() {
  const db = memoryDb();
  seedSource(db);
  return db;
}

describe("triage feedback", () => {
  it("records a dismissal with reasons and the readable summary", () => {
    const db = setup();
    const o = seedOffer(db);
    setTriage(db, o.id, "dismissed", "Contract type — US W2 only", {
      reasons: ["contract"],
      note: "US W2 only",
    });
    expect(getOffer(db, o.id)?.triageReason).toBe("Contract type — US W2 only");
    const fb = currentDismissal(db, o.id);
    expect(fb).toMatchObject({ reasons: ["contract"], note: "US W2 only", learnable: true });
    expect(countPendingDismissals(db)).toBe(1);
  });

  it("records a dismissal without reasons and honours don't-learn", () => {
    const db = setup();
    const a = seedOffer(db);
    const b = seedOffer(db);
    setTriage(db, a.id, "dismissed");
    setTriage(db, b.id, "dismissed", null, { reasons: ["duplicate"], learnable: false });
    expect(currentDismissal(db, a.id)?.reasons).toEqual([]);
    expect(pendingFeedback(db).map((f) => f.offerId)).toEqual([a.id]);
  });

  it("withdraws the dismissal on restore and when the owner changes their mind", () => {
    const db = setup();
    const o = seedOffer(db);
    setTriage(db, o.id, "dismissed", null, { reasons: ["salary"] });
    setTriage(db, o.id, "new");
    expect(currentDismissal(db, o.id)).toBeUndefined();
    expect(countPendingDismissals(db)).toBe(0);

    setTriage(db, o.id, "shortlisted");
    setTriage(db, o.id, "dismissed", null, { reasons: ["stack"] });
    const rows = db.select().from(offerFeedback).all();
    expect(rows.filter((r) => r.withdrawnAt === null).map((r) => r.kind)).toEqual(["dismissed"]);
  });

  it("records applications as positive signals", () => {
    const db = setup();
    const o = seedOffer(db);
    setTriage(db, o.id, "shortlisted");
    createApplication(db, { offerId: o.id });
    expect(positiveSignals(db).map((f) => f.kind)).toEqual(["applied", "shortlisted"]);
  });

  it("marks feedback as learned", () => {
    const db = setup();
    const o = seedOffer(db);
    setTriage(db, o.id, "dismissed", null, { reasons: ["seniority"] });
    markFeedbackLearned(
      db,
      pendingFeedback(db).map((f) => f.id),
    );
    expect(pendingFeedback(db)).toEqual([]);
  });

  it("finds salary dismissals with the stated rate", () => {
    const db = setup();
    const o = seedOffer(db, {
      compMin: 5500,
      compMax: 5500,
      compCurrency: "EUR",
      compPeriod: "hour",
    });
    const other = seedOffer(db);
    setTriage(db, o.id, "dismissed", null, { reasons: ["salary", "stack"] });
    setTriage(db, other.id, "dismissed", null, { reasons: ["stack"] });
    expect(salaryDismissals(db, new Date(0))).toEqual([
      { offerId: o.id, compMin: 5500, compMax: 5500, compCurrency: "EUR", compPeriod: "hour" },
    ]);
  });
});

describe("learned preferences", () => {
  it("locks owner edits against learning runs and hides tombstones", () => {
    const db = setup();
    const p = createLearnedPreference(db, { text: "Avoid crypto companies", polarity: "avoid" });
    expect(updateLearnedByRun(db, p.id, { text: "Avoid crypto and web3" })).toBe(true);
    editLearnedPreference(db, p.id, { text: "Avoid crypto unless AI", polarity: "avoid" });
    expect(updateLearnedByRun(db, p.id, { text: "changed" })).toBe(false);
    expect(activeLearnedPreferences(db)[0]).toMatchObject({
      text: "Avoid crypto unless AI",
      origin: "owner",
    });

    setLearnedStatus(db, p.id, "disabled");
    expect(activeLearnedPreferences(db)).toEqual([]);
    setLearnedStatus(db, p.id, "deleted");
    expect(listLearnedPreferences(db)).toEqual([]);
    expect(listLearnedPreferences(db, { includeDeleted: true })).toHaveLength(1);
  });

  it("tracks when a rescore is suggested", () => {
    const db = setup();
    expect(rescoreSuggested(db)).toBe(false);
    updateLearningState(db, { changedAt: 10 });
    expect(rescoreSuggested(db)).toBe(true);
    updateLearningState(db, { rescoredAt: 11 });
    expect(rescoreSuggested(db)).toBe(false);
    expect(learningState(db)).toMatchObject({ changedAt: 10, rescoredAt: 11 });
  });
});

describe("suggestions", () => {
  it("stores each value once and never re-opens a rejected one", () => {
    const db = setup();
    const input = { kind: "raise_min_hourly" as const, currency: "EUR", value: 65, evidence: [1] };
    const first = upsertSuggestion(db, input);
    expect(first.created).toBe(true);
    decideSuggestion(db, first.suggestion.id, "rejected");
    expect(upsertSuggestion(db, input).created).toBe(false);
    expect(pendingSuggestions(db)).toEqual([]);
  });
});

describe("migration backfill", () => {
  it("turns existing dismissals with a reason into learnable feedback", () => {
    const db = setup();
    const withReason = seedOffer(db, { triage: "dismissed", triageReason: "too junior" });
    seedOffer(db, { triage: "dismissed", triageReason: null });
    const file = readdirSync(migrationsDir()).find((f) => f.startsWith("0002_"));
    const sqlText = readFileSync(join(migrationsDir(), file ?? ""), "utf8");
    const backfill = sqlText.slice(sqlText.indexOf("INSERT INTO `offer_feedback`"));
    db.$client.exec(backfill);
    expect(pendingFeedback(db).map((f) => [f.offerId, f.reasons, f.note])).toEqual([
      [withReason.id, ["other"], "too junior"],
    ]);
  });
});

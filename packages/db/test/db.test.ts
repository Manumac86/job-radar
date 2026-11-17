import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/client";
import {
  addOfferLink,
  createApplication,
  failStaleRuns,
  findOfferBySourceExternalId,
  findRecentDuplicate,
  finishRun,
  getSource,
  listOffers,
  listRuns,
  moveStage,
  offerLinksFor,
  offerTimeline,
  applicationTimeline,
  recordScore,
  scoreHistory,
  setTriage,
  startRun,
  transitionsFor,
  addCustomStage,
  listStages,
  openOfferIds,
} from "../src/index";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("applies the migration to a fresh file and enables WAL and busy timeout", () => {
    const dir = mkdtempSync(join(tmpdir(), "job-radar-db-"));
    dirs.push(dir);
    const db = openDatabase({ path: join(dir, "db", "radar.sqlite") });
    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.$client.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
    const tables = db.$client
      .prepare("select name from sqlite_master where type='table' and name not like '%sqlite%'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of [
      "profiles_meta",
      "sources",
      "runs",
      "companies",
      "offers",
      "offer_links",
      "scores",
      "drafts",
      "applications",
      "stage_transitions",
      "interviews",
      "next_steps",
      "engagements",
      "timeline_events",
      "notifications",
      "llm_usage",
      "settings",
      "custom_stages",
    ]) {
      expect(tables).toContain(t);
    }
    closeDatabase(db);
    // Re-opening is idempotent.
    closeDatabase(openDatabase({ path: join(dir, "db", "radar.sqlite") }));
  });
});

describe("runs", () => {
  it("allows one running run per source and records counts", () => {
    const db = memoryDb();
    seedSource(db);
    const run = startRun(db, "greenhouse", "manual");
    expect(run).not.toBeNull();
    expect(startRun(db, "greenhouse", "schedule")).toBeNull();
    finishRun(db, run!.id, { status: "ok", found: 10, newCount: 3, filtered: 2 });
    const [logged] = listRuns(db, "greenhouse");
    expect(logged).toMatchObject({ status: "ok", found: 10, newCount: 3, filtered: 2 });
    expect(getSource(db, "greenhouse")?.lastRunAt).toBeInstanceOf(Date);
    expect(startRun(db, "greenhouse", "schedule")).not.toBeNull();
    expect(failStaleRuns(db)).toBe(1);
  });
});

describe("offers", () => {
  it("stores offers with a source link, timeline and triage changes", () => {
    const db = memoryDb();
    seedSource(db);
    seedSource(db, "remoteok", "remoteok");
    const offer = seedOffer(db, { externalId: "gh-1" });
    expect(offer.rateUnknown).toBe(true);
    expect(findOfferBySourceExternalId(db, "greenhouse", "gh-1")?.id).toBe(offer.id);
    expect(findRecentDuplicate(db, offer.companyId!, "senior ai engineer", new Date(0))?.id).toBe(
      offer.id,
    );

    expect(
      addOfferLink(db, offer.id, {
        sourceId: "remoteok",
        externalId: "r-9",
        url: "https://remoteok.com/9",
      }),
    ).toBe(true);
    expect(
      addOfferLink(db, offer.id, {
        sourceId: "remoteok",
        externalId: "r-9",
        url: "https://remoteok.com/9",
      }),
    ).toBe(false);
    expect(offerLinksFor(db, offer.id)).toHaveLength(2);
    expect(findOfferBySourceExternalId(db, "remoteok", "r-9")?.id).toBe(offer.id);

    setTriage(db, offer.id, "dismissed", "too junior");
    const kinds = offerTimeline(db, offer.id).map((e) => e.kind);
    expect(kinds).toEqual(["offer_ingested", "offer_link_added", "triage_changed"]);
  });

  it("keeps score history and filters and sorts the list", () => {
    const db = memoryDb();
    seedSource(db);
    const a = seedOffer(db, { externalId: "a", engagementType: "contract" });
    const b = seedOffer(db, { externalId: "b", engagementType: "full-time" });
    const base = {
      skillsFit: 80,
      seniorityFit: 80,
      rateFit: 80,
      locationFit: 80,
      engagementFit: 80,
      rationale: "Good fit.",
      model: "haiku",
    };
    recordScore(db, {
      ...base,
      offerId: a.id,
      overall: 70,
      modelOverall: 70,
      scoreClass: "possible",
    });
    recordScore(db, {
      ...base,
      offerId: a.id,
      overall: 88,
      modelOverall: 88,
      scoreClass: "strong",
    });
    recordScore(db, {
      ...base,
      offerId: b.id,
      overall: 91,
      modelOverall: 91,
      scoreClass: "strong",
    });
    expect(scoreHistory(db, a.id).map((s) => s.overall)).toEqual([88, 70]);

    const strongContract = listOffers(db, { scoreClass: ["strong"], engagementType: ["contract"] });
    expect(strongContract.rows.map((o) => o.id)).toEqual([a.id]);
    expect(listOffers(db, { scoreClass: ["strong"] }).rows.map((o) => o.score)).toEqual([91, 88]);
    expect(listOffers(db, { search: "AI Eng" }).total).toBe(2);
  });
});

describe("applications", () => {
  it("creates an application in 'applied' and records stage transitions on the timeline", () => {
    const db = memoryDb();
    seedSource(db);
    const offer = seedOffer(db);
    const app = createApplication(db, { offerId: offer.id });
    expect(app.stage).toBe("applied");
    expect(createApplication(db, { offerId: offer.id }).id).toBe(app.id);
    expect(openOfferIds(db)).not.toContain(offer.id);

    moveStage(db, app.id, "screening_call");
    const moved = moveStage(db, app.id, "technical_interview", { note: "with CTO" });
    expect(moved.stage).toBe("technical_interview");
    expect(moved.firstResponseAt).toBeInstanceOf(Date);
    expect(transitionsFor(db, app.id).map((t) => t.toStage)).toEqual([
      "applied",
      "screening_call",
      "technical_interview",
    ]);
    const last = applicationTimeline(db, app.id).at(-1);
    expect(last?.message).toBe("Screening call → Technical interview: with CTO");
    expect(() => moveStage(db, app.id, "nope")).toThrow(/Unknown stage/);
  });

  it("supports custom stages", () => {
    const db = memoryDb();
    addCustomStage(db, { key: "reference_check", label: "Reference check", position: 55 });
    const keys = listStages(db).map((s) => s.key);
    expect(keys.indexOf("reference_check")).toBe(keys.indexOf("final_interview") + 1);
    expect(() => addCustomStage(db, { key: "applied", label: "x", position: 1 })).toThrow();
  });
});

describe("llm usage store", () => {
  it("counts calls per day and kind", async () => {
    const { llmUsageStore } = await import("../src/index");
    const db = memoryDb();
    const store = llmUsageStore(db);
    store.record({ day: "2026-11-15", kind: "scoring", model: "haiku", ok: true });
    store.record({ day: "2026-11-15", kind: "extraction", model: "haiku", ok: false });
    store.record({ day: "2026-11-16", kind: "scoring", model: "haiku", ok: true });
    expect(store.count("2026-11-15", ["scoring", "extraction"])).toBe(2);
    expect(store.count("2026-11-15", ["drafting"])).toBe(0);
  });
});

describe("notifications", () => {
  it("stores a notification once per dedupe key and tracks read state", async () => {
    const { createNotification, unreadCount, markNotificationsRead, listNotifications } =
      await import("../src/index");
    const db = memoryDb();
    const a = createNotification(db, {
      kind: "source_stopped",
      title: "t",
      body: "b",
      dedupeKey: "k1",
    });
    const b = createNotification(db, {
      kind: "source_stopped",
      title: "t2",
      body: "b2",
      dedupeKey: "k1",
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.notification.id).toBe(a.notification.id);
    createNotification(db, { kind: "digest", title: "d", body: "x" });
    createNotification(db, { kind: "digest", title: "d", body: "y" });
    expect(unreadCount(db)).toBe(3);
    markNotificationsRead(db, [a.notification.id]);
    expect(listNotifications(db, { unreadOnly: true })).toHaveLength(2);
    expect(markNotificationsRead(db, "all")).toBe(2);
  });
});

describe("interrupted scoring", () => {
  it("puts offers left in 'scoring' back to 'awaiting score'", async () => {
    const { resetInterruptedScoring, setScoreStatus, getOffer } = await import("../src/index");
    const db = memoryDb();
    seedSource(db);
    const o = seedOffer(db);
    setScoreStatus(db, o.id, "scoring");
    expect(resetInterruptedScoring(db)).toBe(1);
    expect(getOffer(db, o.id)?.scoreStatus).toBe("awaiting_score");
  });
});

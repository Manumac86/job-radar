import type { NormalizedOfferInput } from "@job-radar/core";
import {
  getSource,
  listOffers,
  listRuns,
  listNotifications,
  offerLinksFor,
  updateSource,
  upsertSource,
  type Db,
} from "@job-radar/db";
import type { SourceAdapter } from "@job-radar/sources";
import { describe, expect, it } from "vitest";
import { ingestOffers } from "../src/ingest/pipeline";
import { executeRun, MAX_CONSECUTIVE_FAILURES, type RunnerDeps } from "../src/ingest/runner";
import { Scheduler } from "../src/ingest/scheduler";
import { Notifier } from "../src/notifier";
import { testContext } from "./helpers";

function offer(overrides: Partial<NormalizedOfferInput> = {}): NormalizedOfferInput {
  return {
    sourceId: "fake",
    externalId: "1",
    sourceUrl: "https://example.invalid/jobs/1",
    title: "Senior AI Engineer (Remote)",
    companyName: "Acme AI, Inc.",
    remotePolicy: "remote",
    description: "Agentic RAG with TypeScript and Next.js.",
    ...overrides,
  };
}

function fakeAdapter(
  produce: () => NormalizedOfferInput[] | Promise<NormalizedOfferInput[]>,
): SourceAdapter {
  return {
    type: "fake",
    label: "Fake",
    defaultIntervalMinutes: 60,
    fetchOffers: async () => produce(),
  };
}

function deps(db: Db, adapter: SourceAdapter, extra: Partial<RunnerDeps> = {}): RunnerDeps {
  const ctx = testContext();
  return {
    db,
    profile: ctx.profile,
    notifier: new Notifier(db),
    dataDir: "/nonexistent",
    adapters: { fake: adapter },
    ...extra,
  };
}

describe("ingestion pipeline", () => {
  it("de-duplicates the same role across sources into one offer with both links", () => {
    const { db, profile } = testContext();
    const prefs = profile.get()!.preferences;
    upsertSource(db, { id: "ashby", type: "ashby", name: "Ashby" });
    upsertSource(db, { id: "email_alerts", type: "email_alerts", name: "Email" });
    const a = ingestOffers(
      db,
      "ashby",
      [offer({ externalId: "acme:1", sourceUrl: "https://jobs.ashbyhq.com/acme/1" })],
      prefs,
    );
    const b = ingestOffers(
      db,
      "email_alerts",
      [
        offer({
          externalId: "li-77",
          title: "Sr. AI Engineer",
          companyName: "ACME AI",
          sourceUrl: "https://linkedin.com/jobs/77",
        }),
      ],
      prefs,
    );
    expect(a).toMatchObject({ newCount: 1, duplicates: 0 });
    expect(b).toMatchObject({ newCount: 0, duplicates: 1 });
    const { rows } = listOffers(db);
    expect(rows).toHaveLength(1);
    expect(offerLinksFor(db, rows[0]!.id).map((l) => l.url)).toEqual([
      "https://jobs.ashbyhq.com/acme/1",
      "https://linkedin.com/jobs/77",
    ]);
    // Same source + id again: known, not new.
    expect(
      ingestOffers(
        db,
        "ashby",
        [offer({ externalId: "acme:1", sourceUrl: "https://jobs.ashbyhq.com/acme/1" })],
        prefs,
      ),
    ).toMatchObject({ updated: 1, newCount: 0 });
  });

  it("does not merge the same title after the 14-day window", () => {
    const { db, profile } = testContext();
    const prefs = profile.get()!.preferences;
    upsertSource(db, { id: "ashby", type: "ashby", name: "Ashby" });
    ingestOffers(
      db,
      "ashby",
      [offer({ externalId: "old" })],
      prefs,
      new Date("2026-10-01T00:00:00Z"),
    );
    const r = ingestOffers(
      db,
      "ashby",
      [offer({ externalId: "new" })],
      prefs,
      new Date("2026-11-15T00:00:00Z"),
    );
    expect(r.newCount).toBe(1);
  });

  it("stores excluded offers as filtered with the keyword and never queues them for scoring", () => {
    const { db, profile } = testContext();
    const prefs = profile.get()!.preferences;
    upsertSource(db, { id: "ashby", type: "ashby", name: "Ashby" });
    const r = ingestOffers(
      db,
      "ashby",
      [
        offer({ externalId: "wp", title: "WordPress Developer", description: "WordPress themes" }),
        offer({
          externalId: "office",
          title: "AI Engineer",
          companyName: "Other",
          remotePolicy: "onsite",
        }),
        offer({ externalId: "ok", title: "AI Engineer", companyName: "Third" }),
      ],
      prefs,
    );
    expect(r).toMatchObject({ newCount: 3, filtered: 2 });
    expect(r.newOfferIds).toHaveLength(1);
    const filtered = listOffers(db, { triage: ["filtered"] }).rows;
    expect(filtered.map((o) => o.triageReason).sort()).toEqual([
      'Excluded keyword "WordPress"',
      "Not remote (onsite)",
    ]);
    expect(filtered.every((o) => o.scoreStatus === "not_scored")).toBe(true);
    const ok = listOffers(db, { triage: ["new"] }).rows[0]!;
    expect(ok.rateUnknown).toBe(true);
    expect(ok.compMin).toBeNull();
  });
});

describe("runs and scheduling", () => {
  it("runs a due fake source on schedule and records counts in runs", async () => {
    const { db } = testContext();
    upsertSource(db, {
      id: "fake",
      type: "fake",
      name: "Fake",
      enabled: true,
      intervalMinutes: 60,
    });
    const queued: number[][] = [];
    const d = deps(
      db,
      fakeAdapter(() => [
        offer(),
        offer({ externalId: "2", title: "Head of Engineering", companyName: "Beta" }),
      ]),
      {
        onNewOffers: (ids) => queued.push(ids),
      },
    );
    let now = new Date("2026-11-15T10:00:00Z");
    const scheduler = new Scheduler(d, () => now);
    expect(scheduler.tick()).toEqual(["fake"]);
    await scheduler.idle();
    const [run] = listRuns(db, "fake");
    expect(run).toMatchObject({
      status: "ok",
      trigger: "schedule",
      found: 2,
      newCount: 2,
      filtered: 0,
    });
    expect(queued).toEqual([[1, 2]]);

    // Not due again until the interval passes.
    now = new Date(Date.now() + 30 * 60_000);
    expect(scheduler.tick(now)).toEqual([]);
    now = new Date(Date.now() + 61 * 60_000);
    expect(scheduler.tick(now)).toEqual(["fake"]);
    await scheduler.idle();
    expect(listRuns(db, "fake")[0]).toMatchObject({ found: 2, newCount: 0 });

    // Disabled sources never run; their offers stay.
    updateSource(db, "fake", { enabled: false });
    expect(scheduler.tick(new Date(Date.now() + 999 * 60_000))).toEqual([]);
    expect(listOffers(db).total).toBe(2);
  });

  it("'Run now' starts immediately unless a run is in progress", async () => {
    const { db } = testContext();
    upsertSource(db, { id: "fake", type: "fake", name: "Fake", enabled: true });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const scheduler = new Scheduler(
      deps(
        db,
        fakeAdapter(async () => (await gate, [offer()])),
      ),
    );
    expect(scheduler.runNow("fake")).toBe("started");
    expect(scheduler.runNow("fake")).toBe("already_running");
    release();
    await scheduler.idle();
    expect(listRuns(db, "fake")[0]?.trigger).toBe("manual");
    expect(scheduler.runNow("missing")).toBe("not_found");
  });

  it("stops a source for the day after 5 consecutive failures and notifies once", async () => {
    const { db } = testContext();
    upsertSource(db, { id: "fake", type: "fake", name: "Fake", enabled: true });
    const d = deps(
      db,
      fakeAdapter(() => Promise.reject(new Error("HTTP 429 (rate limited) for https://x"))),
      {
        now: () => new Date("2026-11-15T10:00:00Z"),
      },
    );
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) await executeRun(d, "fake", "schedule");
    const source = getSource(db, "fake")!;
    expect(source.status).toBe("stopped");
    expect(source.stoppedUntil?.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(listRuns(db, "fake")[0]?.error).toContain("429");
    const scheduler = new Scheduler(d, () => new Date("2026-11-15T12:00:00Z"));
    expect(scheduler.tick()).toEqual([]);
    expect(listNotifications(db).filter((n) => n.kind === "source_stopped")).toHaveLength(1);
    // Resumes the next day.
    expect(scheduler.tick(new Date("2026-11-16T00:00:00Z"))).toEqual(["fake"]);
    await scheduler.idle();
  });
});

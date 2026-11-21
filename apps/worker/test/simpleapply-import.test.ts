import {
  findOfferByExternalId,
  getApplicationForOffer,
  getOffer,
  offerLinksFor,
  upsertSource,
} from "@job-radar/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchesFromDashboard, type CapturedResponse } from "@job-radar/sources";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importSimpleApplyCsv } from "../src/ingest/simpleapply-import";
import { executeRun, type RunnerDeps } from "../src/ingest/runner";
import { Notifier } from "../src/notifier";
import { ingestOffers } from "../src/ingest/pipeline";
import { testApp, testContext } from "./helpers";

const CSV = readFileSync(
  join(import.meta.dirname, "../../../packages/sources/test/fixtures/simpleapply-export.csv"),
  "utf8",
);
const NOW = new Date("2026-11-18T12:00:00Z");

afterEach(() => vi.restoreAllMocks());

describe("SimpleApply CSV import", () => {
  it("stores new rows, filters, counts invalid rows and records applications, with no network access", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const c = testContext();
    const enqueued: number[] = [];
    const ctx = {
      ...c,
      scoring: { enqueue: (ids: number[]) => void enqueued.push(...ids) },
    } as unknown as typeof c;
    const r = importSimpleApplyCsv(ctx, CSV, NOW);
    expect(r).toEqual({
      found: 5,
      new: 2,
      duplicates: 0,
      filtered: 1,
      invalid: 2,
      applications: 1,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(enqueued).toHaveLength(2);

    const woodgrove = findOfferByExternalId(
      c.db,
      "simpleapply:job-boards.greenhouse.io/woodgrove/jobs/123?gh_jid=123",
    )!;
    expect(woodgrove).toMatchObject({ sourceId: "simpleapply", triage: "new" });
    const northwind = findOfferByExternalId(
      c.db,
      "simpleapply:northwind.wd5.myworkdayjobs.com/en-US/careers/job/London/Platform-Engineer_R123",
    )!;
    expect(northwind.triage).toBe("filtered");

    const fabrikam = findOfferByExternalId(c.db, "simpleapply:jobs.ashbyhq.com/fabrikam/abc-def")!;
    const app = getApplicationForOffer(c.db, fabrikam.id)!;
    // Worker tests run in Europe/Madrid (vitest.config.ts): noon there is 11:00 UTC.
    expect(app.appliedAt.toISOString()).toBe("2026-11-17T11:00:00.000Z");
  });

  it("creates nothing on re-import and never a second application", () => {
    const c = testContext();
    importSimpleApplyCsv(c, CSV, NOW);
    const again = importSimpleApplyCsv(c, CSV, NOW);
    expect(again).toMatchObject({ new: 0, filtered: 0, duplicates: 3, applications: 0 });
  });

  it("links a row to the same role already known from a Greenhouse board", () => {
    const c = testContext();
    upsertSource(c.db, { id: "greenhouse", type: "greenhouse", name: "Greenhouse" });
    ingestOffers(
      c.db,
      "greenhouse",
      [
        {
          sourceId: "greenhouse",
          externalId: "woodgrove:123",
          sourceUrl: "https://job-boards.greenhouse.io/woodgrove/jobs/123",
          title: "Senior Software Engineer, Payments",
          companyName: "Woodgrove",
          remotePolicy: "remote",
          description: "From the board",
        },
      ],
      c.profile.get()!.preferences,
      NOW,
    );
    const id = findOfferByExternalId(c.db, "woodgrove:123")!.id;
    const r = importSimpleApplyCsv(c, CSV, NOW);
    expect(r.duplicates).toBe(1);
    expect(r.new).toBe(1);
    expect(offerLinksFor(c.db, id).map((l) => l.sourceId)).toContain("simpleapply");
    expect(getOffer(c.db, id)?.sourceId).toBe("greenhouse");
  });

  it("route: 201 with counts for a CSV body, 422 naming missing columns", async () => {
    const { app } = testApp();
    const ok = await request(app)
      .post("/offers/import-csv")
      .set("Content-Type", "text/csv")
      .send(CSV);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ new: 2, invalid: 2 });
    const bad = await request(app)
      .post("/offers/import-csv")
      .set("Content-Type", "text/csv")
      .send("Title,Company\nA,B\n");
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatch(/missing columns Job Title, Job URL/);
  });
});

describe("SimpleApply logged-in source in the runner", () => {
  it("stores the dashboard's matches and records the applications SimpleApply reports", async () => {
    const c = testContext();
    upsertSource(c.db, {
      id: "simpleapply",
      type: "simpleapply",
      name: "SimpleApply (logged-in)",
      requiresLogin: true,
      enabled: true,
    });
    const responses = (
      JSON.parse(
        readFileSync(
          join(
            import.meta.dirname,
            "../../../packages/sources/test/fixtures/simpleapply-dashboard.json",
          ),
          "utf8",
        ),
      ) as { responses: CapturedResponse[] }
    ).responses;
    const offers = matchesFromDashboard(responses, NOW).map((m) => m.offer);
    const deps: RunnerDeps = {
      db: c.db,
      profile: c.profile,
      notifier: new Notifier(c.db),
      dataDir: "/x",
      adapters: {
        simpleapply: {
          type: "simpleapply",
          label: "SimpleApply (logged-in)",
          defaultIntervalMinutes: 720,
          requiresLogin: true,
          fetchOffers: async () => offers,
        },
      },
      now: () => NOW,
    };
    const r = await executeRun(deps, "simpleapply", "manual");
    expect(r.status).toBe("finished");
    const tailspin = findOfferByExternalId(
      c.db,
      "simpleapply:tailspin.wd5.myworkdayjobs.com/careers/job/Remote/Principal-Engineer_R9",
    )!;
    expect(getApplicationForOffer(c.db, tailspin.id)?.appliedAt.toISOString()).toBe(
      "2026-11-17T09:00:00.000Z",
    );
    // A second run adds nothing and no second application.
    await executeRun(deps, "simpleapply", "manual");
    expect(
      findOfferByExternalId(c.db, "simpleapply:jobs.ashbyhq.com/fabrikam/abc-def"),
    ).toBeDefined();
  });
});

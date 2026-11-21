import {
  applicationTimeline,
  createApplication,
  findOfferByExternalId,
  getApplication,
  getApplicationForOffer,
  listNotifications,
  listOffers,
  moveStage,
  offerLinksFor,
  portalUpdatesForApplication,
  transitionsFor,
  upsertSource,
} from "@job-radar/db";
import {
  applicationOffer,
  type MyGreenhouseApplication,
  type SourceAdapter,
} from "@job-radar/sources";
import type { NormalizedOfferInput } from "@job-radar/core";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { executeRun } from "../src/ingest/runner";
import { ingestOffers } from "../src/ingest/pipeline";
import { Notifier } from "../src/notifier";
import { PortalService } from "../src/portal/service";
import { testContext } from "./helpers";

const NOW = new Date("2026-11-21T12:00:00Z");

const app = (over: Partial<MyGreenhouseApplication> = {}): MyGreenhouseApplication => ({
  portalId: "100000001",
  jobKey: "northwind:4300000001",
  company: "Northwind Traders, Inc.",
  title: "Senior Software Engineer – Integrations",
  url: "https://job-boards.greenhouse.io/northwind/jobs/4300000001",
  location: "Remote - Europe",
  appliedAt: new Date("2026-11-20T10:00:00Z"),
  status: "applied",
  ...over,
});

const searchOffer: NormalizedOfferInput = {
  sourceId: "mygreenhouse",
  externalId: "contosoai:4100000001",
  sourceUrl: "https://job-boards.greenhouse.io/contosoai/jobs/4100000001",
  title: "AI Software Engineer",
  companyName: "Contoso AI Team",
  remotePolicy: "remote",
  description: "AI Software Engineer at Contoso AI Team (found on MyGreenhouse).",
  companyMeta: { via: "MyGreenhouse search" },
};

function setup() {
  const ctx = testContext();
  const notifier = new Notifier(ctx.db);
  const portal = new PortalService({ db: ctx.db, notifier, now: () => NOW });
  upsertSource(ctx.db, {
    id: "mygreenhouse",
    type: "mygreenhouse",
    name: "MyGreenhouse (logged-in)",
    requiresLogin: true,
    enabled: true,
  });
  upsertSource(ctx.db, { id: "greenhouse", type: "greenhouse", name: "Greenhouse" });
  let current: MyGreenhouseApplication[] = [];
  const adapter: SourceAdapter = {
    type: "mygreenhouse",
    label: "MyGreenhouse (logged-in)",
    defaultIntervalMinutes: 720,
    requiresLogin: true,
    async fetchOffers(c) {
      c.reportApplications?.(current);
      return [...current.flatMap((a) => applicationOffer(a) ?? []), searchOffer];
    },
  };
  const run = (apps: MyGreenhouseApplication[]) => {
    current = apps;
    return executeRun(
      {
        db: ctx.db,
        profile: ctx.profile,
        notifier,
        dataDir: "/tmp",
        adapters: { mygreenhouse: adapter },
        portal,
        now: () => NOW,
      },
      "mygreenhouse",
      "manual",
    );
  };
  return { ...ctx, notifier, portal, run, appHttp: createApp({ ...ctx, notifier, portal }) };
}

/** A job already ingested from the Northwind Greenhouse board, applied to by hand. */
function boardApplication(s: ReturnType<typeof setup>) {
  ingestOffers(
    s.db,
    "greenhouse",
    [
      {
        sourceId: "greenhouse",
        externalId: "northwind:4300000001",
        sourceUrl: "https://job-boards.greenhouse.io/northwind/jobs/4300000001",
        title: "Senior Software Engineer – Integrations",
        companyName: "Northwind Traders",
        remotePolicy: "remote",
        description: "Integrations",
      },
    ],
    s.profile.get()!.preferences,
    NOW,
  );
  const offer = findOfferByExternalId(s.db, "northwind:4300000001")!;
  return createApplication(s.db, { offerId: offer.id, at: new Date("2026-11-20T10:00:00Z") });
}

const portalNotes = (s: ReturnType<typeof setup>) =>
  listNotifications(s.db).filter((n) => n.kind.startsWith("portal_"));

describe("MyGreenhouse runs", () => {
  it("links a job known from the board, imports applied jobs and records statuses once", async () => {
    const s = setup();
    const existing = boardApplication(s);
    const result = await s.run([
      app(),
      app({
        portalId: "100000002",
        jobKey: "northwind:4300000002",
        title: "Software Engineer, Integrations",
        url: "https://job-boards.greenhouse.io/northwind/jobs/4300000002",
        status: "Technical Interview",
      }),
      app({
        portalId: "100000003",
        jobKey: "litware:4300000003",
        company: "Litware",
        title: "Staff Engineer",
        url: "https://job-boards.eu.greenhouse.io/litware/jobs/4300000003",
        status: "inactive",
      }),
    ]);
    expect(result.status).toBe("finished");
    // Cross-source identity (task 2.3): the board's offer is linked, not duplicated.
    const known = findOfferByExternalId(s.db, "northwind:4300000001")!;
    expect(
      offerLinksFor(s.db, known.id)
        .map((l) => l.sourceId)
        .sort(),
    ).toEqual(["greenhouse", "mygreenhouse"]);
    expect(
      listOffers(s.db, {}).rows.filter((o) => o.externalId === "northwind:4300000001"),
    ).toHaveLength(1);

    // "applied" on a matched application: timeline only.
    expect(getApplication(s.db, existing.id)!.stage).toBe("applied");
    expect(portalUpdatesForApplication(s.db, existing.id)[0]).toMatchObject({
      status: "timeline_only",
      lastStatus: "applied",
    });

    // An interview on an unknown application: created, then moved automatically.
    const second = getApplicationForOffer(
      s.db,
      findOfferByExternalId(s.db, "northwind:4300000002")!.id,
    )!;
    expect(second.stage).toBe("technical_interview");
    expect(transitionsFor(s.db, second.id).at(-1)).toMatchObject({
      source: "greenhouse",
      note: "From MyGreenhouse",
    });
    // Inactive: a suggestion to reject, never a move.
    const third = getApplicationForOffer(
      s.db,
      findOfferByExternalId(s.db, "litware:4300000003")!.id,
    )!;
    expect(third.stage).toBe("applied");
    expect(portalUpdatesForApplication(s.db, third.id)[0]).toMatchObject({
      status: "suggested",
      pending: { targetStage: "rejected" },
    });
    expect(
      portalNotes(s)
        .map((n) => [n.kind, n.title])
        .sort(),
    ).toEqual([
      [
        "portal_next_step",
        "MyGreenhouse update for Northwind Traders, Inc. (Software Engineer, Integrations)",
      ],
      ["portal_rejection", "Suggested: MyGreenhouse update for Litware (Staff Engineer)"],
    ]);
    expect(result.status === "finished" && result.run.log.join("\n")).toMatch(
      /statuses: 3 read, 0 unchanged, 2 added to the pipeline, 1 moved, 1 to review/,
    );

    // An unchanged status does nothing.
    const again = await s.run([app()]);
    expect(again.status === "finished" && again.run.log.join("\n")).toMatch(/1 unchanged/);
    expect(portalNotes(s)).toHaveLength(2);
  });

  it("a rejection moves the application and Undo puts it back, once", async () => {
    const s = setup();
    const existing = boardApplication(s);
    await s.run([app()]);
    await s.run([app({ status: "Rejected" })]);
    expect(getApplication(s.db, existing.id)!.stage).toBe("rejected");
    const row = portalUpdatesForApplication(s.db, existing.id)[0]!;
    expect(row.status).toBe("auto_applied");
    expect(portalNotes(s).map((n) => n.kind)).toEqual(["portal_rejection"]);

    const undo = await request(s.appHttp).post(`/portal/updates/${row.id}/undo`);
    expect(undo.status).toBe(200);
    expect(undo.body).toMatchObject({ ok: true, message: "Undone" });
    expect(getApplication(s.db, existing.id)!.stage).toBe("applied");
    expect(applicationTimeline(s.db, existing.id).some((e) => e.kind === "portal_undone")).toBe(
      true,
    );
    const twice = await request(s.appHttp).post(`/portal/updates/${row.id}/undo`);
    expect(twice.status).toBe(409);
    expect(twice.body.message).toBe("Already undone");
  });

  it("after an email already rejected it: no second move and no alert", async () => {
    const s = setup();
    const existing = boardApplication(s);
    moveStage(s.db, existing.id, "rejected", { source: "email", emailId: 1, at: NOW });
    const moves = transitionsFor(s.db, existing.id).length;
    await s.run([app({ status: "Rejected" })]);
    expect(transitionsFor(s.db, existing.id)).toHaveLength(moves);
    expect(portalUpdatesForApplication(s.db, existing.id)[0]!.status).toBe("timeline_only");
    expect(portalNotes(s)).toEqual([]);
  });

  it("an unknown status is a suggestion the owner can dismiss; apply needs a target", async () => {
    const s = setup();
    const existing = boardApplication(s);
    await s.run([app({ status: "Reference Check" })]);
    const row = portalUpdatesForApplication(s.db, existing.id)[0]!;
    expect(row).toMatchObject({ status: "suggested", category: "unknown" });
    const list = await request(s.appHttp).get("/portal/suggestions");
    expect(list.body).toHaveLength(1);
    const dismissed = await request(s.appHttp).post(`/portal/updates/${row.id}/dismiss`);
    expect(dismissed.body).toMatchObject({ ok: true, status: "dismissed" });
    const again = await request(s.appHttp).post(`/portal/updates/${row.id}/dismiss`);
    expect(again.status).toBe(409);
    expect((await request(s.appHttp).post("/portal/updates/999/undo")).status).toBe(404);
  });

  it("applying a suggestion moves the chosen application", async () => {
    const s = setup();
    const existing = boardApplication(s);
    await s.run([app({ status: "inactive" })]);
    const row = portalUpdatesForApplication(s.db, existing.id)[0]!;
    const applied = await request(s.appHttp).post(`/portal/updates/${row.id}/apply`);
    expect(applied.body).toMatchObject({ ok: true, status: "applied" });
    expect(getApplication(s.db, existing.id)!.stage).toBe("rejected");
    const undo = await request(s.appHttp).post(`/portal/updates/${row.id}/undo`);
    expect(undo.body.ok).toBe(true);
    expect(getApplication(s.db, existing.id)!.stage).toBe("applied");
  });
});

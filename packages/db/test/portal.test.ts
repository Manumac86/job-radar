import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/client";
import { migrationsDir } from "../src/paths";
import {
  createApplication,
  findPortalApplication,
  insertPortalApplication,
  moveStage,
  pendingPortalSuggestions,
  portalUpdatesForApplication,
  transitionForPortal,
  transitionsFor,
  updatePortalApplication,
} from "../src/index";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NOW = new Date("2026-11-21T10:00:00Z");

describe("migration 0007_mygreenhouse", () => {
  it("upgrades a 0006 database: transitions keep their rows and gain the portal column", () => {
    const dir = mkdtempSync(join(tmpdir(), "job-radar-db-"));
    dirs.push(dir);
    const old = join(dir, "migrations");
    cpSync(migrationsDir(), old, { recursive: true });
    const journalFile = join(old, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8")) as {
      entries: { tag: string }[];
    };
    const cut = journal.entries.findIndex((e) => e.tag.startsWith("0007_"));
    writeFileSync(
      journalFile,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut) }),
    );
    const path = join(dir, "radar.sqlite");
    const first = openDatabase({ path, migrate: false });
    migrate(first, { migrationsFolder: old });
    seedSource(first);
    const offer = seedOffer(first);
    const app = {
      id: Number(
        first.$client
          .prepare(
            "insert into applications (offer_id, stage, applied_at) values (?, 'applied', ?)",
          )
          .run(offer.id, NOW.getTime()).lastInsertRowid,
      ),
    };
    first.$client
      .prepare(
        "insert into stage_transitions (application_id, from_stage, to_stage, source, email_id, at) values (?, 'applied', 'screening_call', 'email', 3, ?)",
      )
      .run(app.id, NOW.getTime());
    closeDatabase(first);

    const db = openDatabase({ path });
    const moves = transitionsFor(db, app.id);
    expect(moves.at(-1)).toMatchObject({
      toStage: "screening_call",
      source: "email",
      emailId: 3,
      portalApplicationId: null,
    });
    expect(findPortalApplication(db, "mygreenhouse", "1")).toBeUndefined();
    closeDatabase(db);
  });
});

describe("portal applications", () => {
  it("stores one row per portal id, links transitions and lists suggestions", () => {
    const db = memoryDb();
    seedSource(db);
    const offer = seedOffer(db, { title: "Platform Engineer", companyName: "Acme AI" });
    const app = createApplication(db, { offerId: offer.id, at: NOW });
    const row = insertPortalApplication(db, {
      source: "mygreenhouse",
      portalId: "100",
      jobKey: "acme:1",
      company: "Acme AI",
      title: "Platform Engineer",
      applicationId: app.id,
      lastStatus: "applied",
      statusSeenAt: NOW,
      category: "acknowledgement",
      status: "timeline_only",
    });
    expect(() =>
      insertPortalApplication(db, { ...row, id: undefined, createdAt: undefined }),
    ).toThrow();
    expect(findPortalApplication(db, "mygreenhouse", "100")?.id).toBe(row.id);

    moveStage(db, app.id, "rejected", {
      at: NOW,
      source: "greenhouse",
      portalApplicationId: row.id,
    });
    expect(transitionForPortal(db, row.id)).toMatchObject({
      toStage: "rejected",
      source: "greenhouse",
    });

    updatePortalApplication(db, row.id, {
      lastStatus: "inactive",
      category: "closed",
      status: "suggested",
      pending: { targetStage: "rejected", reasons: ["inactive may mean the job closed"] },
    });
    const pending = pendingPortalSuggestions(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.candidates).toEqual([
      {
        applicationId: app.id,
        companyName: "Acme AI",
        title: "Platform Engineer",
        stage: "rejected",
      },
    ]);
    expect(portalUpdatesForApplication(db, app.id).map((r) => r.lastStatus)).toEqual(["inactive"]);
  });
});

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/client";
import { migrationsDir } from "../src/paths";
import { recordScore } from "../src/index";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NOW = new Date("2026-11-22T10:00:00Z");

const score = (offerId: number, extra: Record<string, unknown> = {}) => ({
  offerId,
  overall: 79,
  modelOverall: 74,
  skillsFit: 80,
  seniorityFit: 80,
  rateFit: 50,
  locationFit: 90,
  engagementFit: 80,
  scoreClass: "possible" as const,
  rationale: "Good fit.",
  model: "haiku",
  createdAt: NOW,
  ...extra,
});

describe("migration 0008_preferred_regions", () => {
  it("upgrades a 0007 database: old scores read as no bonus", () => {
    const dir = mkdtempSync(join(tmpdir(), "job-radar-db-"));
    dirs.push(dir);
    const old = join(dir, "migrations");
    cpSync(migrationsDir(), old, { recursive: true });
    const journalFile = join(old, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8")) as {
      entries: { tag: string }[];
    };
    const cut = journal.entries.findIndex((e) => e.tag.startsWith("0008_"));
    writeFileSync(
      journalFile,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut) }),
    );
    const path = join(dir, "radar.sqlite");
    const first = openDatabase({ path, migrate: false });
    migrate(first, { migrationsFolder: old });
    first.$client
      .prepare(
        "insert into sources (id, type, name, enabled) values ('greenhouse', 'greenhouse', 'g', 1)",
      )
      .run();
    first.$client
      .prepare("insert into companies (name, normalized_name) values ('Acme', 'acme')")
      .run();
    const offerId = Number(
      first.$client
        .prepare(
          "insert into offers (source_id, external_id, source_url, title, normalized_title, company_id, company_name) values ('greenhouse', '1', 'https://x.invalid', 'AI Engineer', 'ai engineer', 1, 'Acme')",
        )
        .run().lastInsertRowid,
    );
    first.$client
      .prepare(
        "insert into scores (offer_id, overall, model_overall, skills_fit, seniority_fit, rate_fit, location_fit, engagement_fit, score_class, rationale, model, created_at) values (?, 70, 70, 70, 70, 50, 70, 70, 'possible', 'ok', 'haiku', ?)",
      )
      .run(offerId, NOW.getTime());
    closeDatabase(first);

    const db = openDatabase({ path });
    const row = db.$client
      .prepare("select region_bonus, preferred_region from scores where offer_id = ?")
      .get(offerId);
    expect(row).toEqual({ region_bonus: 0, preferred_region: null });
    closeDatabase(db);
  });

  it("stores the bonus and the region with a score", () => {
    const db = memoryDb();
    seedSource(db);
    const offer = seedOffer(db);
    const s = recordScore(db, score(offer.id, { regionBonus: 5, preferredRegion: "Spain" }));
    expect(s).toMatchObject({
      overall: 79,
      modelOverall: 74,
      regionBonus: 5,
      preferredRegion: "Spain",
    });
  });
});

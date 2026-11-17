import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  backupDatabase,
  closeDatabase,
  listBackups,
  openDatabase,
  restoreDatabase,
  runDailyBackupIfDue,
  setTriage,
  getOffer,
} from "../src/index";
import { seedOffer, seedSource } from "./helpers";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-backup-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("backups", () => {
  it("backs up, mutates and restores the database", async () => {
    const dbPath = join(dir, "db", "radar.sqlite");
    const backups = join(dir, "backups");
    let db = openDatabase({ path: dbPath });
    seedSource(db);
    const offer = seedOffer(db);
    const file = await backupDatabase(db, { dir: backups });

    setTriage(db, offer.id, "dismissed", "mutated after backup");
    expect(getOffer(db, offer.id)?.triage).toBe("dismissed");
    closeDatabase(db);

    const result = restoreDatabase(file, dbPath, { backupDir: backups });
    expect(result.previousSavedAs && existsSync(result.previousSavedAs)).toBe(true);

    db = openDatabase({ path: dbPath });
    expect(getOffer(db, offer.id)?.triage).toBe("new");
    closeDatabase(db);
  });

  it("keeps only the newest 14 backups and makes one per day", async () => {
    const db = openDatabase({ path: ":memory:" });
    const backups = join(dir, "backups");
    for (let day = 1; day <= 16; day++) {
      await backupDatabase(db, { dir: backups, now: new Date(Date.UTC(2026, 10, day, 3)) });
    }
    const kept = listBackups(backups);
    expect(kept).toHaveLength(14);
    expect(kept[0]).toContain("radar-20261116");
    expect(kept.at(-1)).toContain("radar-20261103");

    const sameDay = new Date(Date.UTC(2026, 10, 16, 20));
    expect(await runDailyBackupIfDue(db, { dir: backups, now: sameDay })).toBeNull();
    const nextDay = new Date(Date.UTC(2026, 10, 17, 1));
    expect(await runDailyBackupIfDue(db, { dir: backups, now: nextDay })).toContain(
      "radar-20261117",
    );
  });

  it("refuses files that are not Job Radar databases", () => {
    expect(() => restoreDatabase(join(dir, "missing.sqlite"), join(dir, "x.sqlite"))).toThrow(
      /not found/,
    );
  });

  it("the restore command asks for confirmation and cancels without 'yes'", async () => {
    const dbPath = join(dir, "db", "radar.sqlite");
    const db = openDatabase({ path: dbPath });
    const file = await backupDatabase(db, { dir: join(dir, "backups") });
    closeDatabase(db);
    const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
    const tsx = join(pkg, "..", "..", "node_modules", ".bin", "tsx");
    const env = { ...process.env, JOB_RADAR_DB_PATH: dbPath, JOB_RADAR_DATA_DIR: dir };
    const cancelled = spawnSync(tsx, ["src/cli/restore.ts", file], {
      cwd: pkg,
      env,
      input: "no\n",
      encoding: "utf8",
    });
    expect(cancelled.status).toBe(1);
    expect(cancelled.stdout).toContain("Restore cancelled");
    const confirmed = spawnSync(tsx, ["src/cli/restore.ts", file], {
      cwd: pkg,
      env,
      input: "yes\n",
      encoding: "utf8",
    });
    expect(confirmed.status).toBe(0);
    expect(confirmed.stdout).toContain("Restored from");
    expect(readdirSync(join(dir, "backups")).some((f) => f.startsWith("pre-restore-"))).toBe(true);
  });
});

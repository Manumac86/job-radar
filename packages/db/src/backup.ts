import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Db } from "./client";
import { backupsDir } from "./paths";

export const BACKUP_KEEP = 14;
const PREFIX = "radar-";

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/** Lists backups, newest first. */
export function listBackups(dir = backupsDir()): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(".sqlite"))
    .sort()
    .reverse()
    .map((f) => join(dir, f));
}

export function pruneBackups(dir = backupsDir(), keep = BACKUP_KEEP): string[] {
  const removed = listBackups(dir).slice(keep);
  for (const file of removed) rmSync(file, { force: true });
  return removed;
}

/** Online, consistent backup through SQLite's backup API; keeps the newest 14. */
export async function backupDatabase(
  db: Db,
  options: { dir?: string; now?: Date; keep?: number } = {},
): Promise<string> {
  const dir = options.dir ?? backupsDir();
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${PREFIX}${stamp(options.now ?? new Date())}.sqlite`);
  await db.$client.backup(target);
  pruneBackups(dir, options.keep ?? BACKUP_KEEP);
  return target;
}

/** Makes today's backup if none exists yet for this UTC day. Safe to call often. */
export async function runDailyBackupIfDue(
  db: Db,
  options: { dir?: string; now?: Date } = {},
): Promise<string | null> {
  const now = options.now ?? new Date();
  const today = `${PREFIX}${stamp(now).slice(0, 8)}`;
  const done = listBackups(options.dir).some((f) => basename(f).startsWith(today));
  if (done) return null;
  return backupDatabase(db, options);
}

function assertValidBackup(file: string): void {
  if (!existsSync(file)) throw new Error(`Backup file not found: ${file}`);
  const check = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = check.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Backup failed integrity check: ${String(integrity)}`);
    const hasOffers = check
      .prepare("select 1 from sqlite_master where type='table' and name='offers'")
      .get();
    if (!hasOffers) throw new Error("File is not a Job Radar database (no offers table)");
  } finally {
    check.close();
  }
}

/**
 * Replaces the database file with a backup. The current database is kept as
 * `pre-restore-<time>.sqlite` next to the backups. Stop the worker and web app first.
 */
export function restoreDatabase(
  backupFile: string,
  dbPath: string,
  options: { backupDir?: string; now?: Date } = {},
): { restoredFrom: string; previousSavedAs: string | null } {
  assertValidBackup(backupFile);
  mkdirSync(dirname(dbPath), { recursive: true });
  let previousSavedAs: string | null = null;
  if (existsSync(dbPath)) {
    const dir = options.backupDir ?? backupsDir();
    mkdirSync(dir, { recursive: true });
    previousSavedAs = join(dir, `pre-restore-${stamp(options.now ?? new Date())}.sqlite`);
    // Checkpoint WAL into the main file so the saved copy is complete.
    const current = new Database(dbPath);
    current.pragma("wal_checkpoint(TRUNCATE)");
    current.close();
    copyFileSync(dbPath, previousSavedAs);
  }
  const tmp = `${dbPath}.restore-tmp`;
  copyFileSync(backupFile, tmp);
  for (const suffix of ["-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
  renameSync(tmp, dbPath);
  return { restoredFrom: backupFile, previousSavedAs };
}

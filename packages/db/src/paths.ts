import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root: the nearest ancestor holding pnpm-workspace.yaml. */
function findRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Repository root: the nearest ancestor of the cwd (or of this module) holding pnpm-workspace.yaml. */
export function repoRoot(): string {
  return (
    process.env["JOB_RADAR_ROOT"] ??
    findRoot(process.cwd()) ??
    findRoot(dirname(fileURLToPath(import.meta.url))) ??
    process.cwd()
  );
}

/** Local data directory (database, profile, browser profile, backups, logs). */
export function dataDir(): string {
  return resolve(
    /*turbopackIgnore: true*/ process.env["JOB_RADAR_DATA_DIR"] ?? join(repoRoot(), "data"),
  );
}

export function databasePath(): string {
  return process.env["JOB_RADAR_DB_PATH"] ?? join(dataDir(), "db", "radar.sqlite");
}

export function backupsDir(): string {
  return join(dataDir(), "backups");
}

export function migrationsDir(): string {
  return process.env["JOB_RADAR_MIGRATIONS_DIR"] ?? join(repoRoot(), "packages", "db", "drizzle");
}

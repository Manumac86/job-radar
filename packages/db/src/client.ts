import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { databasePath, migrationsDir } from "./paths";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export interface OpenOptions {
  /** Defaults to data/db/radar.sqlite (or JOB_RADAR_DB_PATH). Use ":memory:" in tests. */
  path?: string;
  /** Apply pending migrations on open. Default true. */
  migrate?: boolean;
}

/** Opens SQLite in WAL mode with a 5 s busy timeout (design D2). */
export function openDatabase(options: OpenOptions = {}): Db {
  const path = options.path ?? databasePath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema }) as Db;
  if (options.migrate !== false) migrate(db, { migrationsFolder: migrationsDir() });
  return db;
}

export function closeDatabase(db: Db): void {
  db.$client.close();
}

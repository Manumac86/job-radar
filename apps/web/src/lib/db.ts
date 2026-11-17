import "server-only";
import { openDatabase, type Db } from "@job-radar/db";

const g = globalThis as typeof globalThis & { __jobRadarDb?: Db };

/** One SQLite connection per server process (WAL lets the worker write concurrently). */
export function db(): Db {
  g.__jobRadarDb ??= openDatabase();
  return g.__jobRadarDb;
}

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { runs, sources, type RunStatus } from "../schema";

export type Run = typeof runs.$inferSelect;

/** Starts a run unless one is already in progress for the source (returns null then). */
export function startRun(
  db: Db,
  sourceId: string,
  trigger: "schedule" | "manual",
  at: Date = new Date(),
): Run | null {
  return db.transaction((tx) => {
    const running = tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.sourceId, sourceId), eq(runs.status, "running")))
      .get();
    if (running) return null;
    return tx.insert(runs).values({ sourceId, trigger, startedAt: at }).returning().get();
  });
}

export interface RunResult {
  status: Exclude<RunStatus, "running">;
  found?: number;
  newCount?: number;
  filtered?: number;
  duplicates?: number;
  error?: string | null;
  log?: string[];
  at?: Date;
}

export function finishRun(db: Db, runId: number, result: RunResult): Run {
  return db.transaction((tx) => {
    const run = tx
      .update(runs)
      .set({
        status: result.status,
        finishedAt: result.at ?? new Date(),
        found: result.found ?? 0,
        newCount: result.newCount ?? 0,
        filtered: result.filtered ?? 0,
        duplicates: result.duplicates ?? 0,
        error: result.error ?? null,
        log: result.log ?? [],
      })
      .where(eq(runs.id, runId))
      .returning()
      .get();
    if (!run) throw new Error(`Run ${runId} not found`);
    tx.update(sources)
      .set({ lastRunAt: run.finishedAt, updatedAt: result.at ?? new Date() })
      .where(eq(sources.id, run.sourceId))
      .run();
    return run;
  });
}

export function isRunInProgress(db: Db, sourceId: string): boolean {
  return Boolean(
    db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.sourceId, sourceId), eq(runs.status, "running")))
      .get(),
  );
}

export function listRuns(db: Db, sourceId: string, limit = 50): Run[] {
  return db
    .select()
    .from(runs)
    .where(eq(runs.sourceId, sourceId))
    .orderBy(desc(runs.startedAt), desc(runs.id))
    .limit(limit)
    .all();
}

export function lastRun(db: Db, sourceId: string): Run | undefined {
  return listRuns(db, sourceId, 1)[0];
}

/** After a crash, runs left "running" are closed as failed so new runs can start. */
export function failStaleRuns(db: Db): number {
  return db
    .update(runs)
    .set({ status: "failed", finishedAt: new Date(), error: "Interrupted by a worker restart" })
    .where(eq(runs.status, "running"))
    .run().changes;
}

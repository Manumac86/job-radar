import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { llmUsage, type LlmKind } from "../schema";

/** Implements core's UsageStore over the llm_usage table. */
export function llmUsageStore(db: Db) {
  return {
    count(day: string, kinds: LlmKind[]): number {
      return (
        db
          .select({ n: sql<number>`count(*)` })
          .from(llmUsage)
          .where(and(eq(llmUsage.day, day), inArray(llmUsage.kind, kinds)))
          .get()?.n ?? 0
      );
    },
    record(entry: {
      day: string;
      kind: LlmKind;
      model: string;
      ok: boolean;
      inputTokens?: number | undefined;
      outputTokens?: number | undefined;
      durationMs?: number | undefined;
    }): void {
      db.insert(llmUsage)
        .values({
          day: entry.day,
          kind: entry.kind,
          model: entry.model,
          ok: entry.ok,
          inputTokens: entry.inputTokens ?? null,
          outputTokens: entry.outputTokens ?? null,
          durationMs: entry.durationMs ?? null,
        })
        .run();
    },
  };
}

export function llmUsageByDay(db: Db, sinceDay: string) {
  return db
    .select({
      day: llmUsage.day,
      kind: llmUsage.kind,
      calls: sql<number>`count(*)`,
      failed: sql<number>`sum(case when ${llmUsage.ok} then 0 else 1 end)`,
    })
    .from(llmUsage)
    .where(sql`${llmUsage.day} >= ${sinceDay}`)
    .groupBy(llmUsage.day, llmUsage.kind)
    .all();
}

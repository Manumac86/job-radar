import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { drafts } from "../schema";
import { addTimelineEvent } from "./timeline";

export type Draft = typeof drafts.$inferSelect;
export type NewDraft = Omit<typeof drafts.$inferInsert, "version" | "id">;

/** Stores a new version; earlier versions remain. */
export function createDraft(db: Db, input: NewDraft): Draft {
  return db.transaction((tx) => {
    const next =
      (tx
        .select({ v: sql<number>`coalesce(max(${drafts.version}), 0)` })
        .from(drafts)
        .where(eq(drafts.offerId, input.offerId))
        .get()?.v ?? 0) + 1;
    const draft = tx
      .insert(drafts)
      .values({ ...input, version: next })
      .returning()
      .get();
    addTimelineEvent(tx, {
      offerId: input.offerId,
      kind: "draft_created",
      message: input.instruction
        ? `Draft v${next} generated ("${input.instruction}")`
        : `Draft v${next} generated`,
      data: { draftId: draft.id, version: next },
    });
    return draft;
  });
}

export function listDrafts(db: Db, offerId: number): Draft[] {
  return db
    .select()
    .from(drafts)
    .where(eq(drafts.offerId, offerId))
    .orderBy(desc(drafts.version))
    .all();
}

export function getDraft(db: Db, id: number): Draft | undefined {
  return db.select().from(drafts).where(eq(drafts.id, id)).get();
}

export function latestDraft(db: Db, offerId: number): Draft | undefined {
  return listDrafts(db, offerId)[0];
}

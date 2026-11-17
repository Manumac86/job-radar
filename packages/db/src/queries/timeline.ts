import { asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { timelineEvents } from "../schema";

export type DbOrTx = Pick<Db, "select" | "insert" | "update" | "delete">;

export interface TimelineInput {
  offerId?: number | null;
  applicationId?: number | null;
  kind: string;
  message: string;
  data?: Record<string, unknown>;
  at?: Date;
}

/** Append-only: there is intentionally no update or delete helper. */
export function addTimelineEvent(db: DbOrTx, input: TimelineInput) {
  return db
    .insert(timelineEvents)
    .values({
      offerId: input.offerId ?? null,
      applicationId: input.applicationId ?? null,
      kind: input.kind,
      message: input.message,
      data: input.data ?? {},
      ...(input.at ? { at: input.at } : {}),
    })
    .returning()
    .get();
}

export function offerTimeline(db: Db, offerId: number) {
  return db
    .select()
    .from(timelineEvents)
    .where(eq(timelineEvents.offerId, offerId))
    .orderBy(asc(timelineEvents.at), asc(timelineEvents.id))
    .all();
}

export function applicationTimeline(db: Db, applicationId: number) {
  return db
    .select()
    .from(timelineEvents)
    .where(eq(timelineEvents.applicationId, applicationId))
    .orderBy(asc(timelineEvents.at), asc(timelineEvents.id))
    .all();
}

import { asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { applications, offers, timelineEvents } from "../schema";

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

/**
 * A note on any offer, applied or not (application-pipeline "Timeline"; offer-notes-and-people
 * D1). It carries the application id when there is one, so it shows on both timelines.
 */
export function addNote(db: Db, offerId: number, text: string) {
  const message = text.trim();
  if (!message) throw new Error("A note needs some text");
  if (!db.select({ id: offers.id }).from(offers).where(eq(offers.id, offerId)).get())
    throw new Error("Offer not found");
  const app = db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.offerId, offerId))
    .get();
  return addTimelineEvent(db, { offerId, applicationId: app?.id ?? null, kind: "note", message });
}

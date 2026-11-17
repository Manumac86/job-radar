import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { notifications, type NotificationKind, type TelegramStatus } from "../schema";

export type Notification = typeof notifications.$inferSelect;

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body: string;
  offerId?: number | null;
  applicationId?: number | null;
  /** Same key → stored once (e.g. "strong_match:42"). */
  dedupeKey?: string | null;
  telegramStatus?: TelegramStatus;
}

/** Inserts unless a notification with the same dedupe key exists. */
export function createNotification(
  db: Db,
  input: NotificationInput,
): { notification: Notification; created: boolean } {
  const inserted = db
    .insert(notifications)
    .values({
      kind: input.kind,
      title: input.title,
      body: input.body,
      offerId: input.offerId ?? null,
      applicationId: input.applicationId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      telegramStatus: input.telegramStatus ?? "pending",
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning()
    .get();
  if (inserted) return { notification: inserted, created: true };
  const existing = db
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, input.dedupeKey ?? ""))
    .get();
  if (!existing) throw new Error("Notification insert failed");
  return { notification: existing, created: false };
}

export function listNotifications(db: Db, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  return db
    .select()
    .from(notifications)
    .where(opts.unreadOnly ? isNull(notifications.readAt) : undefined)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(opts.limit ?? 100)
    .all();
}

export function unreadCount(db: Db): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(notifications)
      .where(isNull(notifications.readAt))
      .get()?.n ?? 0
  );
}

export function markNotificationsRead(db: Db, ids: number[] | "all", at = new Date()): number {
  return db
    .update(notifications)
    .set({ readAt: at })
    .where(
      ids === "all"
        ? isNull(notifications.readAt)
        : and(inArray(notifications.id, ids), isNull(notifications.readAt)),
    )
    .run().changes;
}

export function markNotificationUnread(db: Db, id: number): void {
  db.update(notifications).set({ readAt: null }).where(eq(notifications.id, id)).run();
}

export function notificationsWithTelegramStatus(db: Db, statuses: TelegramStatus[]) {
  return db
    .select()
    .from(notifications)
    .where(inArray(notifications.telegramStatus, statuses))
    .orderBy(notifications.id)
    .all();
}

export function setTelegramStatus(db: Db, ids: number[], status: TelegramStatus, at = new Date()) {
  if (!ids.length) return;
  db.update(notifications)
    .set({ telegramStatus: status, telegramSentAt: status === "sent" ? at : null })
    .where(inArray(notifications.id, ids))
    .run();
}

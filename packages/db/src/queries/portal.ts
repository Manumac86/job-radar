// Applications read from candidate portals (mygreenhouse-source D4): one row per portal
// application, holding its last status, the update it caused and that update's Undo.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import {
  applications,
  offers,
  portalApplications,
  stageTransitions,
  type PortalUpdateStatus,
} from "../schema";

export type PortalApplication = typeof portalApplications.$inferSelect;
export type NewPortalApplication = typeof portalApplications.$inferInsert;

export function getPortalApplication(db: Db, id: number): PortalApplication | undefined {
  return db.select().from(portalApplications).where(eq(portalApplications.id, id)).get();
}

export function findPortalApplication(
  db: Db,
  source: string,
  portalId: string,
): PortalApplication | undefined {
  return db
    .select()
    .from(portalApplications)
    .where(and(eq(portalApplications.source, source), eq(portalApplications.portalId, portalId)))
    .get();
}

export function insertPortalApplication(db: Db, input: NewPortalApplication): PortalApplication {
  return db.insert(portalApplications).values(input).returning().get();
}

export function updatePortalApplication(
  db: Db,
  id: number,
  patch: Partial<NewPortalApplication>,
  at = new Date(),
): PortalApplication {
  const row = db
    .update(portalApplications)
    .set({ ...patch, updatedAt: at })
    .where(eq(portalApplications.id, id))
    .returning()
    .get();
  if (!row) throw new Error(`Portal update ${id} not found`);
  return row;
}

export function portalUpdatesForApplication(db: Db, applicationId: number): PortalApplication[] {
  return db
    .select()
    .from(portalApplications)
    .where(eq(portalApplications.applicationId, applicationId))
    .orderBy(desc(portalApplications.statusSeenAt), desc(portalApplications.id))
    .all();
}

export function portalUpdatesByStatus(db: Db, statuses: PortalUpdateStatus[]): PortalApplication[] {
  return db
    .select()
    .from(portalApplications)
    .where(inArray(portalApplications.status, statuses))
    .orderBy(desc(portalApplications.statusSeenAt), desc(portalApplications.id))
    .all();
}

export interface PortalSuggestionRow {
  update: PortalApplication;
  candidates: { applicationId: number; companyName: string; title: string; stage: string }[];
}

/** Pending portal suggestions with their candidate applications, newest first. */
export function pendingPortalSuggestions(db: Db): PortalSuggestionRow[] {
  const rows = portalUpdatesByStatus(db, ["suggested"]);
  const ids = [...new Set(rows.flatMap((r) => [...r.candidates, r.applicationId ?? 0]))].filter(
    (n) => n > 0,
  );
  const apps = ids.length
    ? db
        .select({
          applicationId: applications.id,
          companyName: offers.companyName,
          title: offers.title,
          stage: applications.stage,
        })
        .from(applications)
        .innerJoin(offers, eq(offers.id, applications.offerId))
        .where(inArray(applications.id, ids))
        .all()
    : [];
  const byId = new Map(apps.map((a) => [a.applicationId, a]));
  return rows.map((update) => {
    const wanted = update.applicationId ? [update.applicationId] : update.candidates;
    return { update, candidates: wanted.flatMap((id) => byId.get(id) ?? []) };
  });
}

/** The stage transition an update wrote for this portal application, if any. */
export function transitionForPortal(db: Db, portalApplicationId: number) {
  return db
    .select()
    .from(stageTransitions)
    .where(eq(stageTransitions.portalApplicationId, portalApplicationId))
    .orderBy(desc(stageTransitions.id))
    .get();
}

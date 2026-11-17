// Company research rows (company-research spec): one active (queued/running) row per company
// at most; the latest done or partial row is the current profile, fresh for 30 days.
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { companies, companyResearch, offers, type ResearchReason } from "../schema";

export type CompanyResearch = typeof companyResearch.$inferSelect;

export const RESEARCH_FRESH_DAYS = 30;
const ACTIVE = ["queued", "running"] as const;
const FINISHED = ["done", "partial"] as const;

export function getCompanyResearch(db: Db, id: number): CompanyResearch | undefined {
  return db.select().from(companyResearch).where(eq(companyResearch.id, id)).get();
}

export function activeCompanyResearch(db: Db, companyId: number): CompanyResearch | undefined {
  return db
    .select()
    .from(companyResearch)
    .where(and(eq(companyResearch.companyId, companyId), inArray(companyResearch.status, ACTIVE)))
    .orderBy(desc(companyResearch.id))
    .get();
}

/** The latest done or partial research: the company's current profile. */
export function currentCompanyResearch(db: Db, companyId: number): CompanyResearch | undefined {
  return db
    .select()
    .from(companyResearch)
    .where(and(eq(companyResearch.companyId, companyId), inArray(companyResearch.status, FINISHED)))
    .orderBy(desc(companyResearch.finishedAt), desc(companyResearch.id))
    .get();
}

/** The latest row of any status (what the Company card shows as state). */
export function latestCompanyResearch(db: Db, companyId: number): CompanyResearch | undefined {
  return db
    .select()
    .from(companyResearch)
    .where(eq(companyResearch.companyId, companyId))
    .orderBy(desc(companyResearch.id))
    .get();
}

export function isResearchFresh(row: CompanyResearch | undefined, now = new Date()): boolean {
  return !!row?.expiresAt && row.expiresAt.getTime() > now.getTime();
}

export type ResearchRequestOutcome =
  | { kind: "active"; row: CompanyResearch }
  | { kind: "fresh"; row: CompanyResearch }
  | { kind: "queued"; row: CompanyResearch };

/**
 * Dedupe (design D5): an active row is reused; a fresh profile is reused unless `force`;
 * otherwise a new queued row is created.
 */
export function requestCompanyResearch(
  db: Db,
  input: {
    companyId: number;
    offerId?: number | null;
    reason: ResearchReason;
    force?: boolean;
    now?: Date;
  },
): ResearchRequestOutcome {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const active = activeCompanyResearch(tx as unknown as Db, input.companyId);
    if (active) return { kind: "active", row: active } as const;
    const current = currentCompanyResearch(tx as unknown as Db, input.companyId);
    if (!input.force && current && isResearchFresh(current, now))
      return { kind: "fresh", row: current } as const;
    const row = tx
      .insert(companyResearch)
      .values({
        companyId: input.companyId,
        offerId: input.offerId ?? null,
        reason: input.reason,
        status: "queued",
        createdAt: now,
      })
      .returning()
      .get();
    return { kind: "queued", row } as const;
  });
}

export function startCompanyResearch(db: Db, id: number, now = new Date()): void {
  db.update(companyResearch)
    .set({ status: "running", startedAt: now, error: null, notBefore: null })
    .where(eq(companyResearch.id, id))
    .run();
}

export function finishCompanyResearch(
  db: Db,
  id: number,
  r: {
    status: "done" | "partial";
    profile: Record<string, unknown>;
    readUrls: string[];
    model: string;
    meta: Record<string, unknown>;
    now?: Date;
  },
): void {
  const now = r.now ?? new Date();
  db.update(companyResearch)
    .set({
      status: r.status,
      profile: r.profile,
      readUrls: r.readUrls,
      model: r.model,
      meta: r.meta,
      error: null,
      finishedAt: now,
      expiresAt: new Date(now.getTime() + RESEARCH_FRESH_DAYS * 864e5),
    })
    .where(eq(companyResearch.id, id))
    .run();
}

export function failCompanyResearch(db: Db, id: number, error: string, now = new Date()): void {
  db.update(companyResearch)
    .set({ status: "failed", error: error.slice(0, 500), finishedAt: now })
    .where(eq(companyResearch.id, id))
    .run();
}

/** Back to the queue until `notBefore` (daily cap), keeping the reason visible. */
export function deferCompanyResearch(db: Db, id: number, notBefore: Date, why: string): void {
  db.update(companyResearch)
    .set({ status: "queued", notBefore, error: why, startedAt: null })
    .where(eq(companyResearch.id, id))
    .run();
}

/** Queued research whose wait is over, oldest first. */
export function dueCompanyResearch(db: Db, now = new Date(), limit = 20): CompanyResearch[] {
  return db
    .select()
    .from(companyResearch)
    .where(
      and(
        eq(companyResearch.status, "queued"),
        or(isNull(companyResearch.notBefore), lte(companyResearch.notBefore, now)),
      ),
    )
    .orderBy(asc(companyResearch.id))
    .limit(limit)
    .all();
}

/** After a restart, research that was running goes back to the queue. */
export function resetInterruptedResearch(db: Db): number {
  return db
    .update(companyResearch)
    .set({ status: "queued", startedAt: null })
    .where(eq(companyResearch.status, "running"))
    .run().changes;
}

export function getCompany(db: Db, id: number) {
  return db.select().from(companies).where(eq(companies.id, id)).get();
}

/** Open offers of one company (not filtered, archived or applied): rescored after research. */
export function openOfferIdsForCompany(db: Db, companyId: number): number[] {
  return db
    .select({ id: offers.id })
    .from(offers)
    .where(
      and(
        eq(offers.companyId, companyId),
        inArray(offers.triage, ["new", "shortlisted"]),
        sql`not exists (select 1 from applications a where a.offer_id = ${offers.id})`,
      ),
    )
    .all()
    .map((r) => r.id);
}

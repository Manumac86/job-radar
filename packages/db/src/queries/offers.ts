import {
  and,
  asc,
  desc,
  eq,
  gte,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "../client";
import {
  applications,
  companies,
  offerFeedback,
  offerLinks,
  offers,
  scores,
  sources,
  type EngagementType,
  type RemotePolicy,
  type ScoreClass,
  type ScoreStatus,
  type TriageState,
} from "../schema";
import { addTimelineEvent, type DbOrTx } from "./timeline";

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

// ---------- sources ----------

/** Inserts a source or updates its definition, keeping the owner's enabled flag and state. */
export function upsertSource(db: Db, input: NewSource): Source {
  return db
    .insert(sources)
    .values(input)
    .onConflictDoUpdate({
      target: sources.id,
      set: { type: input.type, name: input.name, requiresLogin: input.requiresLogin ?? false },
    })
    .returning()
    .get();
}

export function getSource(db: Db, id: string): Source | undefined {
  return db.select().from(sources).where(eq(sources.id, id)).get();
}

export function listSources(db: Db): Source[] {
  return db.select().from(sources).orderBy(asc(sources.name)).all();
}

export function updateSource(db: Db, id: string, patch: Partial<NewSource>): Source | undefined {
  return db
    .update(sources)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(sources.id, id))
    .returning()
    .get();
}

// ---------- companies ----------

export function upsertCompany(
  db: DbOrTx,
  input: {
    name: string;
    normalizedName: string;
    website?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  const existing = db
    .select()
    .from(companies)
    .where(eq(companies.normalizedName, input.normalizedName))
    .get();
  if (existing) {
    if ((input.website && !existing.website) || input.meta) {
      return (
        db
          .update(companies)
          .set({
            website: existing.website ?? input.website ?? null,
            meta: { ...existing.meta, ...(input.meta ?? {}) },
          })
          .where(eq(companies.id, existing.id))
          .returning()
          .get() ?? existing
      );
    }
    return existing;
  }
  return db
    .insert(companies)
    .values({
      name: input.name,
      normalizedName: input.normalizedName,
      website: input.website ?? null,
      meta: input.meta ?? {},
    })
    .returning()
    .get();
}

// ---------- offers ----------

export function getOffer(db: Db, id: number): Offer | undefined {
  return db.select().from(offers).where(eq(offers.id, id)).get();
}

export function findOfferBySourceExternalId(
  db: DbOrTx,
  sourceId: string,
  externalId: string,
): Offer | undefined {
  const link = db
    .select({ offerId: offerLinks.offerId })
    .from(offerLinks)
    .where(and(eq(offerLinks.sourceId, sourceId), eq(offerLinks.externalId, externalId)))
    .get();
  if (!link) return undefined;
  return db.select().from(offers).where(eq(offers.id, link.offerId)).get();
}

/** Cross-source duplicate: same company and normalized title, first seen since `since`. */
/** The offer with this external id from any source (e.g. "linkedin:123" from an email alert). */
export function findOfferByExternalId(db: DbOrTx, externalId: string): Offer | undefined {
  const link = db
    .select({ offerId: offerLinks.offerId })
    .from(offerLinks)
    .where(eq(offerLinks.externalId, externalId))
    .get();
  if (link) return db.select().from(offers).where(eq(offers.id, link.offerId)).get();
  return db.select().from(offers).where(eq(offers.externalId, externalId)).get();
}

export function findRecentDuplicate(
  db: DbOrTx,
  companyId: number,
  normalizedTitle: string,
  since: Date,
): Offer | undefined {
  return db
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.companyId, companyId),
        eq(offers.normalizedTitle, normalizedTitle),
        gte(offers.firstSeenAt, since),
      ),
    )
    .orderBy(asc(offers.id))
    .get();
}

/** Inserts an offer with its first source link and a timeline entry, in one transaction. */
export function insertOffer(db: Db, input: NewOffer): Offer {
  return db.transaction((tx) => {
    const offer = tx.insert(offers).values(input).returning().get();
    tx.insert(offerLinks)
      .values({
        offerId: offer.id,
        sourceId: offer.sourceId,
        externalId: offer.externalId,
        url: offer.sourceUrl,
      })
      .run();
    addTimelineEvent(tx, {
      offerId: offer.id,
      kind: offer.triage === "filtered" ? "offer_filtered" : "offer_ingested",
      message:
        offer.triage === "filtered"
          ? `Filtered: ${offer.triageReason ?? "pre-filter"}`
          : `Ingested from ${offer.sourceId}`,
    });
    return offer;
  });
}

/** Links another source URL to an existing offer (idempotent) and bumps last-seen time. */
export function addOfferLink(
  db: DbOrTx,
  offerId: number,
  link: { sourceId: string; externalId: string; url: string },
): boolean {
  const inserted = db
    .insert(offerLinks)
    .values({ offerId, ...link })
    .onConflictDoNothing()
    .run().changes;
  db.update(offers).set({ lastSeenAt: new Date() }).where(eq(offers.id, offerId)).run();
  if (inserted > 0 && link.sourceId) {
    addTimelineEvent(db, {
      offerId,
      kind: "offer_link_added",
      message: `Also listed on ${link.sourceId}`,
      data: { url: link.url },
    });
  }
  return inserted > 0;
}

export function offerLinksFor(db: Db, offerId: number) {
  return db
    .select()
    .from(offerLinks)
    .where(eq(offerLinks.offerId, offerId))
    .orderBy(asc(offerLinks.seenAt))
    .all();
}

export interface TriageFeedback {
  reasons?: string[];
  note?: string | null;
  /** False when the owner chose "Don't learn from this". */
  learnable?: boolean;
}

/**
 * Changes the triage state. Dismissals and shortlists are recorded as feedback for learning;
 * an earlier dismissal or shortlist of the offer is withdrawn (the owner changed their mind).
 */
export function setTriage(
  db: Db,
  offerId: number,
  triage: TriageState,
  reason?: string | null,
  feedback: TriageFeedback = {},
) {
  return db.transaction((tx) => {
    const offer = tx
      .update(offers)
      .set({ triage, triageReason: reason ?? null, updatedAt: new Date() })
      .where(eq(offers.id, offerId))
      .returning()
      .get();
    if (!offer) throw new Error(`Offer ${offerId} not found`);
    if (triage === "new" || triage === "dismissed" || triage === "shortlisted") {
      tx.update(offerFeedback)
        .set({ withdrawnAt: new Date() })
        .where(
          and(
            eq(offerFeedback.offerId, offerId),
            inArray(offerFeedback.kind, ["dismissed", "shortlisted"]),
            isNull(offerFeedback.withdrawnAt),
          ),
        )
        .run();
    }
    if (triage === "dismissed" || triage === "shortlisted") {
      tx.insert(offerFeedback)
        .values({
          offerId,
          kind: triage,
          reasons: triage === "dismissed" ? (feedback.reasons ?? []) : [],
          note: triage === "dismissed" ? (feedback.note ?? null) : null,
          learnable: feedback.learnable ?? true,
        })
        .run();
    }
    addTimelineEvent(tx, {
      offerId,
      kind: "triage_changed",
      message: reason ? `Marked ${triage}: ${reason}` : `Marked ${triage}`,
      data: { triage },
    });
    return offer;
  });
}

export function setScoreStatus(
  db: DbOrTx,
  offerId: number,
  status: ScoreStatus,
  error: string | null = null,
) {
  db.update(offers)
    .set({ scoreStatus: status, scoreError: error, updatedAt: new Date() })
    .where(eq(offers.id, offerId))
    .run();
}

/** Stores a new score (history is kept) and denormalizes it on the offer. */
export function recordScore(db: Db, input: NewScore): Score {
  return db.transaction((tx) => {
    const score = tx.insert(scores).values(input).returning().get();
    tx.update(offers)
      .set({
        score: score.overall,
        scoreClass: score.scoreClass,
        scoreStatus: "scored",
        scoreError: null,
        updatedAt: new Date(),
      })
      .where(eq(offers.id, score.offerId))
      .run();
    addTimelineEvent(tx, {
      offerId: score.offerId,
      kind: "scored",
      message: `Scored ${score.overall} (${score.scoreClass}) with ${score.model}`,
      data: { scoreId: score.id },
    });
    return score;
  });
}

export function scoreHistory(db: Db, offerId: number): Score[] {
  return db
    .select()
    .from(scores)
    .where(eq(scores.offerId, offerId))
    .orderBy(desc(scores.createdAt), desc(scores.id))
    .all();
}

export function offersAwaitingScore(db: Db, limit = 50): Offer[] {
  return db
    .select()
    .from(offers)
    .where(and(eq(offers.scoreStatus, "awaiting_score"), sql`${offers.triage} <> 'filtered'`))
    .orderBy(asc(offers.id))
    .limit(limit)
    .all();
}

/** Open = not archived, not filtered and without an application. */
export function openOfferIds(db: Db): number[] {
  return db
    .select({ id: offers.id })
    .from(offers)
    .where(
      and(
        inArray(offers.triage, ["new", "shortlisted", "dismissed"]),
        sql`not exists (select 1 from applications a where a.offer_id = ${offers.id})`,
      ),
    )
    .all()
    .map((r) => r.id);
}

export interface OfferFilters {
  scoreClass?: ScoreClass[];
  triage?: TriageState[];
  sourceId?: string[];
  engagementType?: EngagementType[];
  remotePolicy?: RemotePolicy[];
  minScore?: number;
  maxScore?: number;
  /** Rate range on the stated minimum, in minor units of the offer's currency. */
  minRate?: number;
  maxRate?: number;
  postedAfter?: Date;
  search?: string;
  sort?: "score" | "posted" | "company" | "title" | "rate" | "created";
  direction?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Offers with an application: listed ("include", default) or left out ("exclude"). */
  applied?: "include" | "exclude";
}

/** A listed offer with its application's pipeline stage (null without an application). */
export type OfferListRow = Offer & { applicationStage: string | null };

function offerWhere(f: OfferFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (f.scoreClass?.length) conditions.push(inArray(offers.scoreClass, f.scoreClass));
  if (f.triage?.length) conditions.push(inArray(offers.triage, f.triage));
  if (f.sourceId?.length) conditions.push(inArray(offers.sourceId, f.sourceId));
  if (f.engagementType?.length) conditions.push(inArray(offers.engagementType, f.engagementType));
  if (f.remotePolicy?.length) conditions.push(inArray(offers.remotePolicy, f.remotePolicy));
  if (f.minScore !== undefined) conditions.push(gte(offers.score, f.minScore));
  if (f.maxScore !== undefined) conditions.push(lte(offers.score, f.maxScore));
  if (f.minRate !== undefined) conditions.push(gte(offers.compMin, f.minRate));
  if (f.maxRate !== undefined) conditions.push(lte(offers.compMin, f.maxRate));
  if (f.postedAfter) conditions.push(gte(offers.postedAt, f.postedAfter));
  if (f.search?.trim()) {
    const q = `%${f.search.trim().replace(/[%_]/g, "")}%`;
    const match = or(
      like(offers.title, q),
      like(offers.companyName, q),
      like(offers.description, q),
      like(offers.location, q),
    );
    if (match) conditions.push(match);
  }
  return conditions.length ? and(...conditions) : undefined;
}

export function listOffers(
  db: Db,
  f: OfferFilters = {},
): { rows: OfferListRow[]; total: number; appliedHidden: number } {
  const base = offerWhere(f);
  const where =
    f.applied === "exclude"
      ? base
        ? and(base, isNull(applications.id))
        : isNull(applications.id)
      : base;
  const dir = f.direction === "asc" ? asc : desc;
  const sortColumn = {
    score: offers.score,
    posted: offers.postedAt,
    company: offers.companyName,
    title: offers.title,
    rate: offers.compMin,
    created: offers.createdAt,
  }[f.sort ?? "score"];
  // One application per offer at most, so the join never duplicates rows.
  const rows = db
    .select({ ...getTableColumns(offers), applicationStage: applications.stage })
    .from(offers)
    .leftJoin(applications, eq(applications.offerId, offers.id))
    .where(where)
    .orderBy(sql`${sortColumn} is null`, dir(sortColumn), desc(offers.id))
    .limit(f.limit ?? 100)
    .offset(f.offset ?? 0)
    .all();
  const count = (w: SQL | undefined) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(offers)
      .leftJoin(applications, eq(applications.offerId, offers.id))
      .where(w)
      .get()?.n ?? 0;
  const total = count(where);
  const appliedHidden =
    f.applied === "exclude"
      ? count(base ? and(base, isNotNull(applications.id)) : isNotNull(applications.id))
      : 0;
  return { rows, total, appliedHidden };
}

export function touchOffer(db: DbOrTx, offerId: number, at = new Date()): void {
  db.update(offers).set({ lastSeenAt: at }).where(eq(offers.id, offerId)).run();
}

/** After a restart, offers left mid-scoring go back to the queue. */
export function resetInterruptedScoring(db: Db): number {
  return db
    .update(offers)
    .set({ scoreStatus: "awaiting_score" })
    .where(eq(offers.scoreStatus, "scoring"))
    .run().changes;
}

/**
 * Applies the excluded-companies list to stored offers: open offers from an excluded company
 * become "filtered", and offers filtered only for a company that is no longer excluded go
 * back to "new" (queued for scoring if they never were). Offers with an application are left alone.
 */
export function applyCompanyExclusions(
  db: Db,
  matches: (companyName: string) => string | null,
  reasonFor: (company: string) => string,
  reasonPrefix = "Excluded company",
): { hidden: number; restored: number } {
  const candidates = db
    .select({
      id: offers.id,
      companyName: offers.companyName,
      triage: offers.triage,
      triageReason: offers.triageReason,
      scoreStatus: offers.scoreStatus,
    })
    .from(offers)
    .where(
      and(
        or(
          inArray(offers.triage, ["new", "shortlisted"]),
          and(eq(offers.triage, "filtered"), like(offers.triageReason, `${reasonPrefix}%`)),
        ),
        sql`not exists (select 1 from applications a where a.offer_id = ${offers.id})`,
      ),
    )
    .all();
  let hidden = 0;
  let restored = 0;
  for (const o of candidates) {
    const company = matches(o.companyName);
    if (company && o.triage !== "filtered") {
      setTriage(db, o.id, "filtered", reasonFor(company));
      hidden++;
    } else if (!company && o.triage === "filtered") {
      setTriage(db, o.id, "new");
      if (o.scoreStatus === "not_scored") setScoreStatus(db, o.id, "awaiting_score");
      restored++;
    }
  }
  return { hidden, restored };
}

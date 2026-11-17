// Feedback, learned preferences and suggestions (offer-feedback spec).
import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  learnedPreferences,
  offerFeedback,
  offers,
  preferenceSuggestions,
  settings,
  type LearnedStatus,
  type PreferencePolarity,
  type SuggestionKind,
} from "../schema";

export type OfferFeedback = typeof offerFeedback.$inferSelect;
export type LearnedPreference = typeof learnedPreferences.$inferSelect;
export type PreferenceSuggestion = typeof preferenceSuggestions.$inferSelect;

// ---------- settings (key/value) ----------

export function getSetting<T>(db: Db, key: string): T | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value as T | undefined;
}

export function setSetting(db: Db, key: string, value: unknown): void {
  db.insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
    .run();
}

/** When the active learned preferences last changed, and when open offers were last rescored. */
export interface LearningState {
  changedAt: number | null;
  rescoredAt: number | null;
  lastRunAt: number | null;
}

const LEARNING_STATE = "learning_state";

export function learningState(db: Db): LearningState {
  return { changedAt: null, rescoredAt: null, lastRunAt: null, ...getSetting(db, LEARNING_STATE) };
}

export function updateLearningState(db: Db, patch: Partial<LearningState>): LearningState {
  const next = { ...learningState(db), ...patch };
  setSetting(db, LEARNING_STATE, next);
  return next;
}

export function rescoreSuggested(db: Db): boolean {
  const s = learningState(db);
  return s.changedAt !== null && (s.rescoredAt === null || s.rescoredAt < s.changedAt);
}

// ---------- feedback ----------

const offerSummaryColumns = {
  offerId: offers.id,
  title: offers.title,
  companyName: offers.companyName,
  location: offers.location,
  remotePolicy: offers.remotePolicy,
  regions: offers.regions,
  engagementType: offers.engagementType,
  compMin: offers.compMin,
  compMax: offers.compMax,
  compCurrency: offers.compCurrency,
  compPeriod: offers.compPeriod,
  skills: offers.skills,
  description: offers.description,
};

export type FeedbackWithOffer = ReturnType<ReturnType<typeof selectFeedback>["all"]>[number];

const usable = and(isNull(offerFeedback.withdrawnAt), eq(offerFeedback.learnable, true));

function selectFeedback(db: Db) {
  return db
    .select({
      id: offerFeedback.id,
      kind: offerFeedback.kind,
      reasons: offerFeedback.reasons,
      note: offerFeedback.note,
      createdAt: offerFeedback.createdAt,
      ...offerSummaryColumns,
    })
    .from(offerFeedback)
    .innerJoin(offers, eq(offers.id, offerFeedback.offerId));
}

/** Learnable feedback not yet used by a learning run, oldest first. */
export function pendingFeedback(db: Db, limit = 60): FeedbackWithOffer[] {
  return selectFeedback(db)
    .where(and(usable, isNull(offerFeedback.learnedAt)))
    .orderBy(offerFeedback.createdAt, offerFeedback.id)
    .limit(limit)
    .all();
}

export function countPendingDismissals(db: Db): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(offerFeedback)
      .where(and(usable, isNull(offerFeedback.learnedAt), eq(offerFeedback.kind, "dismissed")))
      .get()?.n ?? 0
  );
}

export function countPendingFeedback(db: Db): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(offerFeedback)
      .where(and(usable, isNull(offerFeedback.learnedAt)))
      .get()?.n ?? 0
  );
}

/** Recent shortlists and applications: counterexamples that keep learning from overreaching. */
export function positiveSignals(db: Db, limit = 20): FeedbackWithOffer[] {
  return selectFeedback(db)
    .where(and(usable, inArray(offerFeedback.kind, ["shortlisted", "applied"])))
    .orderBy(desc(offerFeedback.createdAt), desc(offerFeedback.id))
    .limit(limit)
    .all();
}

export function markFeedbackLearned(db: Db, ids: number[], at = new Date()): void {
  if (!ids.length) return;
  db.update(offerFeedback).set({ learnedAt: at }).where(inArray(offerFeedback.id, ids)).run();
}

/** The dismissal currently in effect for an offer (reasons shown on the detail screen). */
export function currentDismissal(db: Db, offerId: number): OfferFeedback | undefined {
  return db
    .select()
    .from(offerFeedback)
    .where(
      and(
        eq(offerFeedback.offerId, offerId),
        eq(offerFeedback.kind, "dismissed"),
        isNull(offerFeedback.withdrawnAt),
      ),
    )
    .orderBy(desc(offerFeedback.id))
    .get();
}

/** Dismissals with reason "salary" since a date, with the offer's stated compensation. */
export function salaryDismissals(db: Db, since: Date) {
  return db
    .select({
      offerId: offers.id,
      compMin: offers.compMin,
      compMax: offers.compMax,
      compCurrency: offers.compCurrency,
      compPeriod: offers.compPeriod,
    })
    .from(offerFeedback)
    .innerJoin(offers, eq(offers.id, offerFeedback.offerId))
    .where(
      and(
        eq(offerFeedback.kind, "dismissed"),
        isNull(offerFeedback.withdrawnAt),
        gte(offerFeedback.createdAt, since),
        sql`exists (select 1 from json_each(${offerFeedback.reasons}) where value = 'salary')`,
      ),
    )
    .all();
}

// ---------- learned preferences ----------

export function listLearnedPreferences(db: Db, opts: { includeDeleted?: boolean } = {}) {
  return db
    .select()
    .from(learnedPreferences)
    .where(opts.includeDeleted ? undefined : ne(learnedPreferences.status, "deleted"))
    .orderBy(learnedPreferences.id)
    .all();
}

export function activeLearnedPreferences(db: Db): LearnedPreference[] {
  return db
    .select()
    .from(learnedPreferences)
    .where(eq(learnedPreferences.status, "active"))
    .orderBy(learnedPreferences.id)
    .all();
}

export function getLearnedPreference(db: Db, id: number): LearnedPreference | undefined {
  return db.select().from(learnedPreferences).where(eq(learnedPreferences.id, id)).get();
}

export function createLearnedPreference(
  db: Db,
  input: {
    text: string;
    polarity: PreferencePolarity;
    origin?: "learned" | "owner";
    evidence?: number[];
  },
): LearnedPreference {
  return db
    .insert(learnedPreferences)
    .values({
      text: input.text,
      polarity: input.polarity,
      origin: input.origin ?? "learned",
      evidence: input.evidence ?? [],
    })
    .returning()
    .get();
}

/** Learning-run update; never touches owner preferences or ones not active. */
export function updateLearnedByRun(
  db: Db,
  id: number,
  patch: { text?: string; evidence?: number[] },
): boolean {
  const res = db
    .update(learnedPreferences)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(learnedPreferences.id, id),
        eq(learnedPreferences.origin, "learned"),
        eq(learnedPreferences.status, "active"),
      ),
    )
    .run();
  return res.changes > 0;
}

/** Owner edit: the preference becomes the owner's and is locked against learning runs. */
export function editLearnedPreference(
  db: Db,
  id: number,
  patch: { text: string; polarity: PreferencePolarity },
): LearnedPreference | undefined {
  return db
    .update(learnedPreferences)
    .set({ ...patch, origin: "owner", updatedAt: new Date() })
    .where(and(eq(learnedPreferences.id, id), ne(learnedPreferences.status, "deleted")))
    .returning()
    .get();
}

/** A learning run retires a learned preference: it is removed, not tombstoned. */
export function removeLearnedByRun(db: Db, id: number): boolean {
  const res = db
    .delete(learnedPreferences)
    .where(
      and(
        eq(learnedPreferences.id, id),
        eq(learnedPreferences.origin, "learned"),
        eq(learnedPreferences.status, "active"),
      ),
    )
    .run();
  return res.changes > 0;
}

export function setLearnedStatus(
  db: Db,
  id: number,
  status: LearnedStatus,
): LearnedPreference | undefined {
  return db
    .update(learnedPreferences)
    .set({ status, updatedAt: new Date() })
    .where(eq(learnedPreferences.id, id))
    .returning()
    .get();
}

// ---------- suggestions ----------

/** Stores a suggestion once per (kind, currency, value); a rejected one never comes back. */
export function upsertSuggestion(
  db: Db,
  input: { kind: SuggestionKind; currency: string; value: number; evidence: number[] },
): { suggestion: PreferenceSuggestion; created: boolean } {
  const inserted = db
    .insert(preferenceSuggestions)
    .values(input)
    .onConflictDoNothing()
    .returning()
    .get();
  if (inserted) return { suggestion: inserted, created: true };
  const existing = db
    .select()
    .from(preferenceSuggestions)
    .where(
      and(
        eq(preferenceSuggestions.kind, input.kind),
        eq(preferenceSuggestions.currency, input.currency),
        eq(preferenceSuggestions.value, input.value),
      ),
    )
    .get();
  if (!existing) throw new Error("Suggestion insert failed");
  return { suggestion: existing, created: false };
}

export function pendingSuggestions(db: Db): PreferenceSuggestion[] {
  return db
    .select()
    .from(preferenceSuggestions)
    .where(eq(preferenceSuggestions.status, "pending"))
    .orderBy(desc(preferenceSuggestions.id))
    .all();
}

export function getSuggestion(db: Db, id: number): PreferenceSuggestion | undefined {
  return db.select().from(preferenceSuggestions).where(eq(preferenceSuggestions.id, id)).get();
}

export function decideSuggestion(
  db: Db,
  id: number,
  status: "accepted" | "rejected",
): PreferenceSuggestion | undefined {
  return db
    .update(preferenceSuggestions)
    .set({ status, decidedAt: new Date() })
    .where(and(eq(preferenceSuggestions.id, id), eq(preferenceSuggestions.status, "pending")))
    .returning()
    .get();
}

/** Other pending suggestions of the same kind and currency are obsolete (accepted or newer). */
export function supersedeSuggestions(
  db: Db,
  kind: SuggestionKind,
  currency: string,
  exceptId?: number,
): void {
  db.update(preferenceSuggestions)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(
      and(
        eq(preferenceSuggestions.kind, kind),
        eq(preferenceSuggestions.currency, currency),
        eq(preferenceSuggestions.status, "pending"),
        exceptId === undefined ? undefined : ne(preferenceSuggestions.id, exceptId),
      ),
    )
    .run();
}

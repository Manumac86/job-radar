import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  applications,
  engagements,
  interviewPreps,
  interviews,
  nextSteps,
  offers,
  scores,
  type InterviewPlanData,
} from "../schema";
import { addTimelineEvent } from "./timeline";

export type Interview = typeof interviews.$inferSelect;
export type NextStep = typeof nextSteps.$inferSelect;

export function interviewsBetween(db: Db, from: Date, to: Date) {
  return db
    .select({ interview: interviews, application: applications, offer: offers })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(and(gte(interviews.scheduledAt, from), lt(interviews.scheduledAt, to)))
    .orderBy(asc(interviews.scheduledAt))
    .all();
}

export function nextStepsDueBetween(db: Db, from: Date, to: Date) {
  return db
    .select({ step: nextSteps, application: applications, offer: offers })
    .from(nextSteps)
    .innerJoin(applications, eq(applications.id, nextSteps.applicationId))
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(and(isNull(nextSteps.doneAt), gte(nextSteps.dueAt, from), lt(nextSteps.dueAt, to)))
    .orderBy(asc(nextSteps.dueAt))
    .all();
}

/** Offers whose latest score was created in [from, to) with one of the classes. */
export function offersScoredBetween(
  db: Db,
  from: Date,
  to: Date,
  classes: ("strong" | "possible" | "weak")[],
) {
  return db
    .select()
    .from(offers)
    .where(
      and(
        inArray(offers.scoreClass, classes),
        sql`exists (select 1 from ${scores} s where s.offer_id = ${offers.id} and s.created_at >= ${from.getTime()} and s.created_at < ${to.getTime()})`,
        inArray(offers.triage, ["new", "shortlisted"]),
      ),
    )
    .orderBy(desc(offers.score))
    .all();
}

export function applicationsInStage(db: Db, stage: string) {
  return db
    .select({ application: applications, offer: offers })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(eq(applications.stage, stage))
    .orderBy(asc(applications.appliedAt))
    .all();
}

export function interviewsFor(db: Db, applicationId: number): Interview[] {
  return db
    .select()
    .from(interviews)
    .where(eq(interviews.applicationId, applicationId))
    .orderBy(asc(interviews.scheduledAt))
    .all();
}

export function nextStepFor(db: Db, applicationId: number): NextStep | undefined {
  return db.select().from(nextSteps).where(eq(nextSteps.applicationId, applicationId)).get();
}

// ---------- writes (each records a timeline event and counts as activity) ----------

export type Engagement = typeof engagements.$inferSelect;

function touchApplication(db: Db, applicationId: number, at: Date) {
  return db
    .update(applications)
    .set({ lastActivityAt: at, updatedAt: at })
    .where(eq(applications.id, applicationId))
    .returning()
    .get();
}

export interface InterviewInput {
  type: Interview["type"];
  scheduledAt: Date;
  timeZone: string;
  durationMinutes?: number | null;
  interviewers?: string[];
  link?: string | null;
  prepNotes?: string | null;
  outcome?: string | null;
}

export function addInterview(
  db: Db,
  applicationId: number,
  input: InterviewInput,
  at = new Date(),
): Interview {
  return db.transaction((tx) => {
    const app = tx.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!app) throw new Error(`Application ${applicationId} not found`);
    const interview = tx
      .insert(interviews)
      .values({ applicationId, ...input, interviewers: input.interviewers ?? [] })
      .returning()
      .get();
    tx.update(applications)
      .set({ lastActivityAt: at, updatedAt: at })
      .where(eq(applications.id, applicationId))
      .run();
    addTimelineEvent(tx, {
      offerId: app.offerId,
      applicationId,
      kind: "interview_added",
      message: `Interview scheduled: ${input.type.replace(/_/g, " ")} on ${input.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC (${input.timeZone})`,
      data: { interviewId: interview.id },
      at,
    });
    return interview;
  });
}

export function updateInterview(
  db: Db,
  interviewId: number,
  patch: Partial<InterviewInput>,
  at = new Date(),
): Interview {
  const current = db.select().from(interviews).where(eq(interviews.id, interviewId)).get();
  if (!current) throw new Error(`Interview ${interviewId} not found`);
  const rescheduled =
    patch.scheduledAt && patch.scheduledAt.getTime() !== current.scheduledAt.getTime();
  const updated = db
    .update(interviews)
    .set({ ...patch, ...(rescheduled ? { reminderSentAt: null } : {}) })
    .where(eq(interviews.id, interviewId))
    .returning()
    .get();
  if (!updated) throw new Error(`Interview ${interviewId} not found`);
  const app = touchApplication(db, current.applicationId, at);
  if (app && (patch.outcome || rescheduled)) {
    addTimelineEvent(db, {
      offerId: app.offerId,
      applicationId: app.id,
      kind: "interview_updated",
      message: patch.outcome ? `Interview outcome: ${patch.outcome}` : "Interview rescheduled",
      data: { interviewId },
      at,
    });
  }
  return updated;
}

export function deleteInterview(db: Db, interviewId: number): void {
  db.delete(interviews).where(eq(interviews.id, interviewId)).run();
}

/** One current next step per application (replaces the previous one). */
export function setNextStep(
  db: Db,
  applicationId: number,
  input: { description: string; dueAt: Date | null },
  at = new Date(),
): NextStep {
  return db.transaction((tx) => {
    const app = tx.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!app) throw new Error(`Application ${applicationId} not found`);
    const step = tx
      .insert(nextSteps)
      .values({ applicationId, description: input.description, dueAt: input.dueAt, doneAt: null })
      .onConflictDoUpdate({
        target: nextSteps.applicationId,
        set: { description: input.description, dueAt: input.dueAt, doneAt: null, createdAt: at },
      })
      .returning()
      .get();
    addTimelineEvent(tx, {
      offerId: app.offerId,
      applicationId,
      kind: "next_step_set",
      message: `Next step: ${input.description}${input.dueAt ? ` (due ${input.dueAt.toISOString().slice(0, 10)})` : ""}`,
      at,
    });
    return step;
  });
}

export function completeNextStep(db: Db, applicationId: number, at = new Date()): void {
  const step = nextStepFor(db, applicationId);
  if (!step || step.doneAt) return;
  db.update(nextSteps).set({ doneAt: at }).where(eq(nextSteps.id, step.id)).run();
  const app = touchApplication(db, applicationId, at);
  if (app) {
    addTimelineEvent(db, {
      offerId: app.offerId,
      applicationId,
      kind: "next_step_done",
      message: `Done: ${step.description}`,
      at,
    });
  }
}

export interface EngagementInput {
  rateMinor: number;
  currency: string;
  ratePeriod: Engagement["ratePeriod"];
  weeklyHours: number;
  startDate: string;
  endDate?: string | null;
  clientContact?: string | null;
  active?: boolean;
}

export function upsertEngagement(
  db: Db,
  applicationId: number,
  input: EngagementInput,
  at = new Date(),
): Engagement {
  const row = db
    .insert(engagements)
    .values({ applicationId, ...input, active: input.active ?? true })
    .onConflictDoUpdate({ target: engagements.applicationId, set: { ...input, updatedAt: at } })
    .returning()
    .get();
  const app = touchApplication(db, applicationId, at);
  if (app) {
    addTimelineEvent(db, {
      offerId: app.offerId,
      applicationId,
      kind: "engagement_saved",
      message: `Engagement: ${input.weeklyHours} h/week from ${input.startDate}`,
      at,
    });
  }
  return row;
}

export function engagementFor(db: Db, applicationId: number): Engagement | undefined {
  return db.select().from(engagements).where(eq(engagements.applicationId, applicationId)).get();
}

export function activeEngagements(db: Db) {
  return db
    .select({ engagement: engagements, application: applications, offer: offers })
    .from(engagements)
    .innerJoin(applications, eq(applications.id, engagements.applicationId))
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(eq(engagements.active, true))
    .all();
}

export function committedWeeklyHours(db: Db): number {
  return activeEngagements(db).reduce((sum, r) => sum + r.engagement.weeklyHours, 0);
}

// ---------- reminders and suggestions ----------

export const NO_RESPONSE_DAYS = 14;

/** Applications still in "applied" with no update for 14 days and no suggestion yet. */
export function applicationsWithoutResponse(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - NO_RESPONSE_DAYS * 86_400_000);
  return db
    .select({ application: applications, offer: offers })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(
      and(
        eq(applications.stage, "applied"),
        lt(applications.lastActivityAt, cutoff),
        isNull(applications.noResponseSuggestedAt),
      ),
    )
    .all();
}

export function markNoResponseSuggested(db: Db, applicationId: number, at = new Date()): void {
  db.update(applications)
    .set({ noResponseSuggestedAt: at })
    .where(eq(applications.id, applicationId))
    .run();
}

/** Interviews starting within the next 24 hours whose reminder has not been sent. */
export function interviewsNeedingReminder(db: Db, now = new Date(), windowMs = 86_400_000) {
  return db
    .select({ interview: interviews, application: applications, offer: offers })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(
      and(
        isNull(interviews.reminderSentAt),
        gte(interviews.scheduledAt, now),
        lt(interviews.scheduledAt, new Date(now.getTime() + windowMs)),
      ),
    )
    .all();
}

export function markReminderSent(db: Db, interviewId: number, at = new Date()): void {
  db.update(interviews).set({ reminderSentAt: at }).where(eq(interviews.id, interviewId)).run();
}

/** Board data: every application with its offer, next step and upcoming interview count. */
export function boardApplications(db: Db) {
  const rows = db
    .select({ application: applications, offer: offers })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .orderBy(desc(applications.lastActivityAt))
    .all();
  return rows.map((r) => ({
    ...r,
    nextStep: nextStepFor(db, r.application.id) ?? null,
    interviews: interviewsFor(db, r.application.id),
    engagement: engagementFor(db, r.application.id) ?? null,
  }));
}

// ---------- interview prep ----------

export type InterviewPrep = typeof interviewPreps.$inferSelect;

export function createInterviewPrep(
  db: Db,
  input: { applicationId: number; stage: string; plan: InterviewPlanData; model: string },
): InterviewPrep {
  return db.transaction((tx) => {
    const prep = tx.insert(interviewPreps).values(input).returning().get();
    const app = tx
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .get();
    if (app)
      addTimelineEvent(tx, {
        offerId: app.offerId,
        applicationId: app.id,
        kind: "interview_prep_created",
        message: `Interview prep generated for ${input.stage.replace(/_/g, " ")}`,
        data: { prepId: prep.id, stage: input.stage },
      });
    return prep;
  });
}

/** Latest prep per application (any stage), for the board. */
export function latestInterviewPreps(db: Db): Map<number, InterviewPrep> {
  const rows = db.select().from(interviewPreps).orderBy(asc(interviewPreps.createdAt)).all();
  return new Map(rows.map((r) => [r.applicationId, r]));
}

export function latestInterviewPrep(
  db: Db,
  applicationId: number,
  stage?: string,
): InterviewPrep | undefined {
  return db
    .select()
    .from(interviewPreps)
    .where(
      and(
        eq(interviewPreps.applicationId, applicationId),
        stage ? eq(interviewPreps.stage, stage) : undefined,
      ),
    )
    .orderBy(desc(interviewPreps.createdAt), desc(interviewPreps.id))
    .get();
}

// ---------- follow-up reminders ----------

/**
 * Applications still in "applied" whose last activity is at least one of `days` old. Each
 * (application, threshold, last activity) pair yields one reminder key, so any update resets
 * the clock and each threshold fires once.
 */
export function followUpsDue(db: Db, days: number[], now = new Date()) {
  if (!days.length) return [];
  const thresholds = [...new Set(days)].sort((a, b) => a - b);
  const rows = db
    .select({ application: applications, offer: offers })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(eq(applications.stage, "applied"))
    .all();
  const due: {
    application: (typeof rows)[number]["application"];
    offer: (typeof rows)[number]["offer"];
    days: number;
    dedupeKey: string;
  }[] = [];
  for (const r of rows) {
    const idle = (now.getTime() - r.application.lastActivityAt.getTime()) / 86_400_000;
    // Only the largest threshold reached, so a late start does not send a burst.
    const reached = thresholds.filter((d) => idle >= d).pop();
    if (reached === undefined) continue;
    due.push({
      ...r,
      days: reached,
      dedupeKey: `follow_up:${r.application.id}:${reached}:${r.application.lastActivityAt.getTime()}`,
    });
  }
  return due;
}

import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import {
  APPLICATION_STAGES,
  CLOSING_STAGES,
  applications,
  customStages,
  drafts,
  offerFeedback,
  offers,
  scores,
  stageTransitions,
  type BuiltinStage,
  type TransitionSource,
} from "../schema";
import { addTimelineEvent } from "./timeline";

export type Application = typeof applications.$inferSelect;
export type StageTransition = typeof stageTransitions.$inferSelect;
export type CustomStage = typeof customStages.$inferSelect;

export interface StageInfo {
  key: string;
  label: string;
  isClosing: boolean;
  custom: boolean;
  position: number;
}

const BUILTIN_LABELS: Record<BuiltinStage, string> = {
  applied: "Applied",
  screening_call: "Screening call",
  technical_interview: "Technical interview",
  take_home: "Take-home / test task",
  fit_interview: "Fit / culture interview",
  final_interview: "Final interview",
  offer_received: "Offer received",
  accepted: "Accepted",
  rejected: "Rejected (by them)",
  declined: "Declined (by me)",
  withdrawn: "Withdrawn",
  no_response: "No response",
};

/** Built-in stages in board order, with custom stages slotted by position. */
export function listStages(db: Db): StageInfo[] {
  const builtins: StageInfo[] = APPLICATION_STAGES.map((key, i) => ({
    key,
    label: BUILTIN_LABELS[key],
    isClosing: CLOSING_STAGES.includes(key),
    custom: false,
    position: i * 10,
  }));
  const custom: StageInfo[] = db
    .select()
    .from(customStages)
    .all()
    .map((s) => ({
      key: s.key,
      label: s.label,
      isClosing: s.isClosing,
      custom: true,
      position: s.position,
    }));
  return [...builtins, ...custom].sort((a, b) => a.position - b.position);
}

export function stageExists(db: Db, key: string): boolean {
  return listStages(db).some((s) => s.key === key);
}

export function addCustomStage(
  db: Db,
  input: { key: string; label: string; position: number; isClosing?: boolean },
): CustomStage {
  if ((APPLICATION_STAGES as readonly string[]).includes(input.key)) {
    throw new Error(`"${input.key}" is a built-in stage`);
  }
  return db
    .insert(customStages)
    .values({ ...input, isClosing: input.isClosing ?? false })
    .returning()
    .get();
}

export function getApplication(db: Db, id: number): Application | undefined {
  return db.select().from(applications).where(eq(applications.id, id)).get();
}

export function getApplicationForOffer(db: Db, offerId: number): Application | undefined {
  return db.select().from(applications).where(eq(applications.offerId, offerId)).get();
}

/**
 * "Mark as applied": the owner sent the application manually. Creates the application in
 * stage "applied" with the sent draft version attached. Idempotent per offer.
 */
export function createApplication(
  db: Db,
  input: {
    offerId: number;
    sentDraftId?: number | null;
    note?: string | null;
    at?: Date;
    /** The CV sent (cv-variants D5): a variant, or { id: "master" }; omitted means unknown. */
    cv?: CvSent | null;
  },
): Application {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(applications)
      .where(eq(applications.offerId, input.offerId))
      .get();
    if (existing) return existing;
    if (input.sentDraftId) {
      const draft = tx.select().from(drafts).where(eq(drafts.id, input.sentDraftId)).get();
      if (!draft || draft.offerId !== input.offerId) {
        throw new Error(`Draft ${input.sentDraftId} does not belong to offer ${input.offerId}`);
      }
    }
    const at = input.at ?? new Date();
    const app = tx
      .insert(applications)
      .values({
        offerId: input.offerId,
        sentDraftId: input.sentDraftId ?? null,
        stage: "applied",
        appliedAt: at,
        lastActivityAt: at,
        cvVariant: input.cv?.id ?? null,
        cvVariantName: input.cv?.name ?? null,
      })
      .returning()
      .get();
    tx.insert(stageTransitions)
      .values({
        applicationId: app.id,
        fromStage: null,
        toStage: "applied",
        note: input.note ?? null,
        at,
      })
      .run();
    tx.update(offers).set({ updatedAt: at }).where(eq(offers.id, input.offerId)).run();
    // A positive signal for learning (offer-feedback spec).
    tx.insert(offerFeedback)
      .values({ offerId: input.offerId, kind: "applied", createdAt: at })
      .run();
    addTimelineEvent(tx, {
      offerId: input.offerId,
      applicationId: app.id,
      kind: "applied",
      message: input.sentDraftId
        ? `Marked as applied (sent draft #${input.sentDraftId})`
        : "Marked as applied",
      data: { sentDraftId: input.sentDraftId ?? null },
      at,
    });
    return app;
  });
}

export interface CvSent {
  id: string;
  name: string;
}

/**
 * CV to pre-select in "Mark as applied": the sent draft's variant, else the offer's
 * recommended variant, else the master CV. Null when the owner has no variants.
 */
export function suggestedCvSent(
  db: Db,
  offerId: number,
  sentDraftId: number | null,
  variants: readonly { id: string; name: string }[],
): CvSent | null {
  if (!variants.length) return null;
  const nameOf = (id: string) =>
    id === "master" ? "Master CV" : (variants.find((v) => v.id === id)?.name ?? null);
  if (sentDraftId) {
    const d = db.select().from(drafts).where(eq(drafts.id, sentDraftId)).get();
    if (d?.cvVariant)
      return { id: d.cvVariant, name: d.cvVariantName ?? nameOf(d.cvVariant) ?? d.cvVariant };
  }
  const rec = db
    .select({ id: scores.recommendedCv })
    .from(scores)
    .where(eq(scores.offerId, offerId))
    .orderBy(desc(scores.createdAt), desc(scores.id))
    .get()?.id;
  const recName = rec ? nameOf(rec) : null;
  if (rec && recName) return { id: rec, name: recName };
  return { id: "master", name: "Master CV" };
}

/** Changes the CV recorded as sent, with a timeline entry (cv-variants D5). */
export function setApplicationCv(db: Db, applicationId: number, cv: CvSent | null): Application {
  return db.transaction((tx) => {
    const app = tx.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!app) throw new Error(`Application ${applicationId} not found`);
    if ((app.cvVariant ?? null) === (cv?.id ?? null)) return app;
    const updated = tx
      .update(applications)
      .set({ cvVariant: cv?.id ?? null, cvVariantName: cv?.name ?? null, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))
      .returning()
      .get();
    addTimelineEvent(tx, {
      offerId: app.offerId,
      applicationId,
      kind: "cv_sent",
      message: cv ? `CV sent changed to ${cv.name}` : "CV sent cleared",
      data: { cvVariant: cv?.id ?? null },
    });
    return updated;
  });
}

export function moveStage(
  db: Db,
  applicationId: number,
  toStage: string,
  options: {
    note?: string | null;
    at?: Date;
    /** Who made the change (application-emails D5). */
    source?: TransitionSource;
    emailId?: number | null;
  } = {},
): Application {
  const stages = listStages(db);
  const target = stages.find((s) => s.key === toStage);
  if (!target) throw new Error(`Unknown stage "${toStage}"`);
  return db.transaction((tx) => {
    const app = tx.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!app) throw new Error(`Application ${applicationId} not found`);
    if (app.stage === toStage) return app;
    const at = options.at ?? new Date();
    // Any move out of "applied" other than to "no response" counts as their first response.
    const isResponse =
      app.stage === "applied" && toStage !== "no_response" && toStage !== "withdrawn";
    const updated = tx
      .update(applications)
      .set({
        stage: toStage,
        lastActivityAt: at,
        updatedAt: at,
        closedAt: target.isClosing ? at : null,
        firstResponseAt: app.firstResponseAt ?? (isResponse ? at : null),
      })
      .where(eq(applications.id, applicationId))
      .returning()
      .get();
    if (!updated) throw new Error(`Application ${applicationId} not found`);
    tx.insert(stageTransitions)
      .values({
        applicationId,
        fromStage: app.stage,
        toStage,
        note: options.note ?? null,
        source: options.source ?? "manual",
        emailId: options.emailId ?? null,
        at,
      })
      .run();
    const fromLabel = stages.find((s) => s.key === app.stage)?.label ?? app.stage;
    addTimelineEvent(tx, {
      offerId: app.offerId,
      applicationId,
      kind: "stage_changed",
      message: `${fromLabel} → ${target.label}${options.note ? `: ${options.note}` : ""}`,
      data: {
        from: app.stage,
        to: toStage,
        ...(options.source === "email"
          ? { source: "email", emailId: options.emailId ?? null }
          : {}),
      },
      at,
    });
    return updated;
  });
}

export function transitionsFor(db: Db, applicationId: number): StageTransition[] {
  return db
    .select()
    .from(stageTransitions)
    .where(eq(stageTransitions.applicationId, applicationId))
    .orderBy(asc(stageTransitions.at), asc(stageTransitions.id))
    .all();
}

export function listApplications(db: Db) {
  return db
    .select({ application: applications, offer: offers })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .orderBy(desc(applications.lastActivityAt))
    .all();
}

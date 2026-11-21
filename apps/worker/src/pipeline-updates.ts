// Automatic pipeline updates and their partial Undo, shared by email replies (application-emails
// D6) and portal statuses (mygreenhouse-source D4). The caller records its own row and timeline.
import {
  addInterview,
  completeNextStep,
  deleteInterview,
  getApplication,
  getInterview,
  markApplicationReplied,
  moveStage,
  nextStepFor,
  restoreNextStep,
  setFirstResponseAt,
  setNextStep,
  transitionForEmail,
  transitionForPortal,
  type Db,
  type EmailUndo,
  type InterviewInput,
  type TransitionSource,
} from "@job-radar/db";

/** Which row made the change: an email or a portal application. */
export type UpdateOrigin =
  { source: "email"; emailId: number } | { source: TransitionSource; portalApplicationId: number };

export interface PipelineUpdate {
  applicationId: number;
  targetStage: string | null;
  /** Shown on the stage transition, e.g. "From email". */
  note: string;
  nextStep?: { description: string; dueAt: Date | null } | null;
  interview?: Omit<InterviewInput, "prepNotes"> & { prepNotes?: string | null };
  at: Date;
}

function originFields(origin: UpdateOrigin) {
  return "emailId" in origin
    ? { source: origin.source, emailId: origin.emailId }
    : { source: origin.source, portalApplicationId: origin.portalApplicationId };
}

function transitionOf(db: Db, origin: UpdateOrigin) {
  return "emailId" in origin
    ? transitionForEmail(db, origin.emailId)
    : transitionForPortal(db, origin.portalApplicationId);
}

/** Writes stage, next step and interview, and returns what Undo needs. */
export function applyPipelineUpdate(db: Db, u: PipelineUpdate, origin: UpdateOrigin): EmailUndo {
  const app = getApplication(db, u.applicationId);
  if (!app) throw new Error("Application not found");
  const prev = nextStepFor(db, u.applicationId);
  const undo: EmailUndo = {
    previousStage: app.stage,
    targetStage: null,
    transitionId: null,
    previousNextStep: prev
      ? {
          description: prev.description,
          dueAt: prev.dueAt?.getTime() ?? null,
          doneAt: prev.doneAt?.getTime() ?? null,
        }
      : null,
    nextStepId: null,
    nextStep: null,
    interviewId: null,
    interviewScheduledAt: null,
    previousFirstResponseAt: app.firstResponseAt?.getTime() ?? null,
  };
  if (u.targetStage && u.targetStage !== app.stage) {
    moveStage(db, u.applicationId, u.targetStage, {
      note: u.note,
      ...originFields(origin),
      at: u.at,
    });
    undo.targetStage = u.targetStage;
    undo.transitionId = transitionOf(db, origin)?.id ?? null;
    if (u.targetStage === "rejected") completeNextStep(db, u.applicationId, u.at);
  }
  markApplicationReplied(db, u.applicationId, u.at);
  if (u.nextStep) {
    const step = setNextStep(db, u.applicationId, u.nextStep, u.at);
    undo.nextStepId = step.id;
    undo.nextStep = { description: step.description, dueAt: step.dueAt?.getTime() ?? null };
  }
  if (u.interview) {
    const interview = addInterview(
      db,
      u.applicationId,
      { ...u.interview, prepNotes: u.interview.prepNotes ?? null },
      u.at,
    );
    undo.interviewId = interview.id;
    undo.interviewScheduledAt = interview.scheduledAt.getTime();
  }
  return undo;
}

/**
 * Reverts an update, except parts the owner changed since (D6 partial undo). Returns what was
 * kept, e.g. "the stage (it was changed after the email)".
 */
export function undoPipelineUpdate(
  db: Db,
  applicationId: number,
  u: EmailUndo,
  origin: UpdateOrigin,
  options: { note: string; changedAfter: string; at: Date },
): string[] {
  const left: string[] = [];
  const app = getApplication(db, applicationId);
  if (!app) throw new Error("Application not found");
  if (u.targetStage) {
    if (app.stage === u.targetStage) {
      moveStage(db, applicationId, u.previousStage, {
        note: options.note,
        ...originFields(origin),
        at: options.at,
      });
      setFirstResponseAt(
        db,
        applicationId,
        u.previousFirstResponseAt === null ? null : new Date(u.previousFirstResponseAt),
      );
    } else left.push(`the stage (it was changed after ${options.changedAfter})`);
  }
  if (u.interviewId) {
    const iv = getInterview(db, u.interviewId);
    if (iv && iv.scheduledAt.getTime() === u.interviewScheduledAt)
      deleteInterview(db, u.interviewId);
    else if (iv) left.push("the interview (it was edited)");
  }
  const step = nextStepFor(db, applicationId);
  const stepUnchanged =
    step &&
    u.nextStep &&
    step.id === u.nextStepId &&
    step.description === u.nextStep.description &&
    (step.dueAt?.getTime() ?? null) === u.nextStep.dueAt;
  if (u.nextStepId) {
    if (stepUnchanged) restoreNextStep(db, applicationId, u.previousNextStep);
    else left.push("the next step (it was edited)");
  } else if (u.targetStage === "rejected" && u.previousNextStep && !u.previousNextStep.doneAt) {
    // The rejection marked the pending next step done.
    if (step?.doneAt) restoreNextStep(db, applicationId, u.previousNextStep);
  }
  return left;
}

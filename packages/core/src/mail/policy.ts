// Action policy for classified replies (application-emails D5). Pure: decides, never writes.
import type { ReplyCategory, ValidatedReply } from "./classify";

/** Forward order of the built-in open stages. */
export const STAGE_ORDER = [
  "applied",
  "screening_call",
  "technical_interview",
  "take_home",
  "fit_interview",
  "final_interview",
  "offer_received",
] as const;

/** Stages an email may never move an application to. */
export const NEVER_FROM_EMAIL = ["accepted", "declined", "withdrawn", "no_response"] as const;
const CLOSED = ["rejected", "declined", "withdrawn", "no_response", "accepted"];

export interface PolicyApplication {
  stage: string;
  /** True when the stage is a custom one (never targeted, never moved automatically). */
  customStage: boolean;
}

export type PolicyAction = "auto" | "suggest" | "timeline_only";

export interface PolicyDecision {
  action: PolicyAction;
  /** Stage to move to; null means no stage change (interview, next step or timeline only). */
  targetStage: string | null;
  /** Why it was not applied automatically (shown with the suggestion). */
  reasons: string[];
}

const INTERVIEW_STAGE: Record<string, string> = {
  screening: "screening_call",
  technical: "technical_interview",
  fit: "fit_interview",
  final: "final_interview",
};

/** The stage a category points to, or null for "no change". */
export function targetStageFor(
  reply: Pick<ValidatedReply, "category" | "interview">,
  currentStage: string,
): string | null | "unknown" {
  const byCategory: Partial<Record<ReplyCategory, string>> = {
    rejection: "rejected",
    offer: "offer_received",
    take_home: "take_home",
  };
  const direct = byCategory[reply.category];
  if (direct) return direct;
  if (reply.category === "interview_invitation") {
    const mapped = reply.interview ? INTERVIEW_STAGE[reply.interview.kind] : undefined;
    if (mapped) return mapped;
    return currentStage === "applied" ? "screening_call" : "unknown";
  }
  return null;
}

function rank(stage: string): number {
  return (STAGE_ORDER as readonly string[]).indexOf(stage);
}

export function decide(reply: ValidatedReply, app: PolicyApplication | null): PolicyDecision {
  if (reply.category === "acknowledgement" || reply.category === "other") {
    return { action: "timeline_only", targetStage: null, reasons: [] };
  }
  const reasons = [...reply.issues];
  if (!app || reply.applicationId === null) {
    return {
      action: "suggest",
      targetStage: null,
      reasons: [...reasons, "not sure which application it is about"],
    };
  }
  const raw = targetStageFor(reply, app.stage);
  const target = raw === "unknown" ? null : raw;
  if (raw === "unknown") reasons.push("interview round not clear");
  if (reply.confidence !== "high") reasons.push(`${reply.confidence} confidence`);
  if (CLOSED.includes(app.stage)) reasons.push("the application is closed");
  if (app.customStage) reasons.push("the application is in a custom stage");

  let targetStage: string | null = target;
  if (target && target === app.stage) targetStage = null;
  else if (target && target !== "rejected" && !app.customStage && !CLOSED.includes(app.stage)) {
    if (rank(target) <= rank(app.stage)) reasons.push("it would move the application backwards");
  }
  if (targetStage && (NEVER_FROM_EMAIL as readonly string[]).includes(targetStage)) {
    reasons.push("emails never close an application this way");
  }
  return { action: reasons.length ? "suggest" : "auto", targetStage, reasons };
}

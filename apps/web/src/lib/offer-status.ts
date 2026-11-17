// Status and Pipeline columns of the offers list (offers-applied-status D3, D4).
import { TRIAGE_LABELS } from "./format";

export type OfferStatus = "applied" | "new" | "shortlisted" | "dismissed" | "filtered" | "archived";

/** "Applied" when the offer has an application, otherwise its triage state. */
export function offerStatus(triage: string, applicationStage: string | null): OfferStatus {
  if (applicationStage) return "applied";
  return (triage in TRIAGE_LABELS ? triage : "new") as OfferStatus;
}

export const STATUS_LABELS: Record<OfferStatus, string> = {
  applied: "Applied",
  ...(TRIAGE_LABELS as Record<Exclude<OfferStatus, "applied">, string>),
};

/** One theme token per status (globals.css): tinted background, border and text in that hue. */
export const STATUS_BADGE_CLASSES: Record<OfferStatus, string> = {
  applied: "border-status-applied/40 bg-status-applied/15 text-status-applied",
  shortlisted: "border-status-shortlisted/40 bg-status-shortlisted/15 text-status-shortlisted",
  new: "border-status-new/40 bg-status-new/15 text-status-new",
  dismissed: "border-status-dismissed/40 bg-status-dismissed/15 text-status-dismissed",
  filtered: "border-status-filtered/40 bg-status-filtered/15 text-status-filtered",
  archived: "border-status-archived/40 bg-status-archived/15 text-status-archived",
};

/** Pipeline column: the stage's label (custom stages included), empty without an application. */
export function pipelineLabel(
  applicationStage: string | null,
  stageLabels: Record<string, string>,
): string {
  if (!applicationStage) return "";
  return stageLabels[applicationStage] ?? applicationStage.replace(/_/g, " ");
}

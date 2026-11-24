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

/** Status as a chart annotation (globals.css tokens): live states tinted, spent states quiet. */
export const STATUS_BADGE_CLASSES: Record<OfferStatus, string> = {
  applied: "rounded-sm border-status-applied/45 bg-status-applied/10 text-status-applied",
  shortlisted:
    "rounded-sm border-status-shortlisted/45 bg-status-shortlisted/10 text-status-shortlisted",
  new: "rounded-sm border-border bg-transparent text-status-new",
  dismissed:
    "rounded-sm border-transparent bg-transparent text-status-dismissed line-through decoration-1",
  filtered:
    "rounded-sm border-dashed border-status-filtered/50 bg-transparent text-status-filtered",
  archived: "rounded-sm border-transparent bg-transparent text-status-archived",
};

/** Pipeline column: the stage's label (custom stages included), empty without an application. */
export function pipelineLabel(
  applicationStage: string | null,
  stageLabels: Record<string, string>,
): string {
  if (!applicationStage) return "";
  return stageLabels[applicationStage] ?? applicationStage.replace(/_/g, " ");
}

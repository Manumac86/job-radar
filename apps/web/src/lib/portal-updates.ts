import "server-only";
import type { PortalApplication, PortalSuggestionRow } from "@job-radar/db";

/** Serializable view of a portal status update for client components (mygreenhouse-source). */
export interface PortalUpdateView {
  id: number;
  /** "MyGreenhouse". */
  portal: string;
  company: string;
  title: string;
  url: string | null;
  status: string;
  seenAt: string;
  state: PortalApplication["status"];
  /** The stage it moves (or would move) the application to. */
  targetStage: string | null;
  targetLabel: string | null;
  reasons: string[];
  candidates: { applicationId: number; label: string }[];
}

const PORTAL_LABEL: Record<string, string> = { mygreenhouse: "MyGreenhouse" };

export function toPortalView(
  row: PortalApplication,
  candidates: PortalSuggestionRow["candidates"] = [],
  stageLabel: (key: string) => string = (key) => key.replace(/_/g, " "),
): PortalUpdateView {
  const targetStage = row.undo?.targetStage ?? row.pending?.targetStage ?? null;
  return {
    id: row.id,
    portal: PORTAL_LABEL[row.source] ?? row.source,
    company: row.company,
    title: row.title,
    url: row.url,
    status: row.lastStatus,
    seenAt: row.statusSeenAt.toISOString(),
    state: row.status,
    targetStage,
    targetLabel: targetStage ? stageLabel(targetStage) : null,
    reasons: row.pending?.reasons ?? [],
    candidates: candidates.map((c) => ({
      applicationId: c.applicationId,
      label: `${c.title} at ${c.companyName}`,
    })),
  };
}

// Candidate-portal application statuses (mygreenhouse-source D4). Pure: maps a portal status to a
// category, to the reply shape the email `decide` policy takes, and matches it to an application.
import { normalizeCompany, normalizeTitle } from "../offers/normalize";
import type { InterviewKind, ValidatedReply } from "./classify";
import { decide, targetStageFor, type PolicyApplication, type PolicyDecision } from "./policy";

export const PORTAL_CATEGORY_LIST = [
  "acknowledgement",
  "in_review",
  "interview",
  "offer",
  "rejection",
  "closed",
  "unknown",
] as const;
export type PortalStatusCategory = (typeof PORTAL_CATEGORY_LIST)[number];

const RULES: [RegExp, PortalStatusCategory][] = [
  [/\b(reject|rejected|not (selected|moving forward)|unsuccessful|declined)\b/i, "rejection"],
  [/\boffer\b/i, "offer"],
  [
    /\b(interview|screen|screening|phone|call|onsite|on-site|assessment|take[- ]?home|technical|panel|final round)\b/i,
    "interview",
  ],
  [/\b(review|reviewing|under consideration|in progress|submitted)\b/i, "in_review"],
  [/^applied$|\bapplication (received|sent)\b/i, "acknowledgement"],
];

/** `applied` → acknowledgement, `inactive` → closed, stage names by keyword, else unknown. */
export function portalCategory(status: string): PortalStatusCategory {
  const s = status.trim();
  if (/^inactive$/i.test(s)) return "closed";
  for (const [re, category] of RULES) if (re.test(s)) return category;
  return "unknown";
}

function interviewKind(status: string): InterviewKind {
  if (/\b(final|onsite|on-site|panel)\b/i.test(status)) return "final";
  if (/\b(technical|coding|system design|assessment|take[- ]?home)\b/i.test(status))
    return "technical";
  if (/\b(culture|fit|values|behaviou?ral)\b/i.test(status)) return "fit";
  if (/\b(screen|screening|phone|recruiter|intro)\b/i.test(status)) return "screening";
  return "other";
}

const CLOSED_REASON =
  "Greenhouse only says the application is inactive: rejected, or the job closed";

/** The status as the reply shape `decide` takes (confidence is high: the portal states it). */
export function portalReply(
  status: string,
  applicationId: number | null,
  label = "MyGreenhouse",
): ValidatedReply {
  const category = portalCategory(status);
  const base = {
    applicationId,
    confidence: "high" as const,
    summary: `${label}: ${status}`,
    nextStep: null,
    interview: null,
    issues: [] as string[],
  };
  switch (category) {
    case "rejection":
      return { ...base, category: "rejection" };
    case "closed":
      return { ...base, category: "rejection", issues: [CLOSED_REASON] };
    case "offer":
      return { ...base, category: "offer" };
    case "interview":
      return {
        ...base,
        category: "interview_invitation",
        interview: { kind: interviewKind(status), scheduledAt: null, timeZone: null, link: null },
      };
    case "acknowledgement":
      return { ...base, category: "acknowledgement" };
    default:
      return { ...base, category: "other" };
  }
}

/**
 * The email policy applied to a portal status (D4): the same moves, never to Accepted, Declined or
 * Withdrawn. Unknown statuses become a suggestion with no target; a move to the current stage
 * records the timeline only.
 */
export function decidePortal(
  status: string,
  app: PolicyApplication | null,
  applicationId: number | null,
): PolicyDecision {
  const category = portalCategory(status);
  if (category === "unknown")
    return { action: "suggest", targetStage: null, reasons: [`unknown status "${status}"`] };
  const reply = portalReply(status, applicationId);
  // Already there (an email moved it first, or it was closed by hand): nothing to do.
  if (app && targetStageFor(reply, app.stage) === app.stage)
    return { action: "timeline_only", targetStage: null, reasons: [] };
  const d = decide(reply, app);
  if (d.action === "auto" && d.targetStage === null)
    return { action: "timeline_only", targetStage: null, reasons: [] };
  return d;
}

export interface PortalMatchCandidate {
  applicationId: number;
  companyName: string;
  title: string;
  /** External ids of the application's offer (and its links), e.g. `acme:123`. */
  jobKeys: string[];
}

export interface PortalMatch {
  applicationId: number | null;
  /** Candidates when it is not sure (several fit). */
  candidates: number[];
  via: "job" | "title" | null;
}

function tokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter(Boolean));
}

/** Shared tokens over all tokens (Jaccard). */
export function titleOverlap(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

const BOARD_JOB = /^[\w-]+:\d+$/;

/** D4 matching: the same job, else one application at the company with a similar title. */
export function matchPortalApplication(
  portal: { jobKey: string | null; company: string; title: string },
  open: PortalMatchCandidate[],
): PortalMatch {
  const one = (list: PortalMatchCandidate[], via: "job" | "title"): PortalMatch | null => {
    const [only] = list;
    return list.length === 1 && only
      ? { applicationId: only.applicationId, candidates: [], via }
      : null;
  };
  const jobKey = portal.jobKey;
  if (jobKey) {
    const byJob = one(
      open.filter((c) => c.jobKeys.includes(jobKey)),
      "job",
    );
    if (byJob) return byJob;
  }
  const company = normalizeCompany(portal.company);
  // An application for a different Greenhouse job is never this one, whatever its title.
  const otherJob = (c: PortalMatchCandidate) =>
    jobKey !== null && c.jobKeys.some((k) => BOARD_JOB.test(k)) && !c.jobKeys.includes(jobKey);
  const sameCompany = open.filter(
    (c) => normalizeCompany(c.companyName) === company && !otherJob(c),
  );
  const title = normalizeTitle(portal.title);
  const exact = one(
    sameCompany.filter((c) => normalizeTitle(c.title) === title),
    "title",
  );
  if (exact) return exact;
  const similar = sameCompany.filter((c) => titleOverlap(c.title, portal.title) >= 0.6);
  return (
    one(similar, "title") ?? {
      applicationId: null,
      candidates: similar.map((c) => c.applicationId),
      via: null,
    }
  );
}

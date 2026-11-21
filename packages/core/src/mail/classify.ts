// Reply classification (application-emails D4): one structured call per matched email, with the
// email as untrusted data and a closed list of candidate applications.
import { z } from "zod";
import { callStructured, type StructuredDeps } from "../llm/structured";
import { UNTRUSTED_DATA_RULES, wrapUntrusted } from "../llm/untrusted";
import { zonedTimeToUtc } from "../time";
import type { ApplicationCandidate } from "./prefilter";

export const REPLY_CATEGORIES = [
  "rejection",
  "interview_invitation",
  "take_home",
  "offer",
  "information_request",
  "acknowledgement",
  "other",
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];
export const REPLY_CONFIDENCES = ["high", "medium", "low"] as const;
export type ReplyConfidence = (typeof REPLY_CONFIDENCES)[number];
export const INTERVIEW_KINDS = ["screening", "technical", "fit", "final", "other"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
  .describe("Local date or date-time as written in the email: YYYY-MM-DD or YYYY-MM-DDTHH:MM");

export const replyClassificationSchema = z
  .object({
    application_id: z
      .number()
      .int()
      .nullable()
      .describe("The id of the candidate application this email is about; null if none or unsure"),
    category: z.enum(REPLY_CATEGORIES),
    confidence: z
      .enum(REPLY_CONFIDENCES)
      .describe("high only when the email clearly states the outcome or invitation"),
    summary: z.string().min(3).max(160).describe("One line: what the email says"),
    next_step: z
      .object({
        description: z.string().min(3).max(200).describe("What the owner has to do next"),
        due: localDateTime.nullable(),
        time_zone: z.string().max(64).nullable().describe("IANA time zone, null if not stated"),
      })
      .strict()
      .nullable(),
    interview: z
      .object({
        kind: z.enum(INTERVIEW_KINDS),
        scheduled_at: localDateTime.nullable().describe("Only when a concrete time is fixed"),
        time_zone: z.string().max(64).nullable(),
        link: z.string().max(500).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ReplyClassification = z.infer<typeof replyClassificationSchema>;

export const REPLY_SYSTEM = [
  "You read one email received by a job seeker and decide whether it is a reply to one of their job applications.",
  "Pick the application only from the candidate list; use null when none fits or two fit equally.",
  "Categories: rejection (the process ends), interview_invitation (asks to schedule or confirms a call or interview), take_home (a test or assignment), offer (a job or contract offer), information_request (asks for documents, availability, rate or answers), acknowledgement (automatic 'we received your application'), other.",
  "Use confidence high only when the email states it explicitly. Marketing, newsletters and job alerts are 'other' with low confidence.",
  "Dates: copy the local date/time and the time zone as written; do not convert. Use null when not stated.",
  UNTRUSTED_DATA_RULES,
].join("\n");

export interface ReplyEmail {
  fromName: string | null;
  fromAddress: string;
  subject: string;
  receivedAt: Date;
  body: string;
}

export function buildReplyPrompt(
  email: ReplyEmail,
  candidates: readonly ApplicationCandidate[],
  ownerTimeZone: string,
): string {
  const list = candidates
    .map(
      (c) =>
        `- id ${c.applicationId}: ${c.title} at ${c.companyName} (stage: ${c.stage.replace(/_/g, " ")}, applied ${c.appliedAt.toISOString().slice(0, 10)})`,
    )
    .join("\n");
  const header = [
    `From: ${email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}`,
    `Subject: ${email.subject}`,
    `Date: ${email.receivedAt.toISOString()}`,
  ].join("\n");
  return [
    `Today is ${email.receivedAt.toISOString().slice(0, 10)}. The owner's time zone is ${ownerTimeZone}.`,
    "",
    "Candidate applications:",
    list,
    "",
    wrapUntrusted("email", `${header}\n\n${email.body}`),
  ].join("\n");
}

/** A classification checked against the candidates, with dates resolved to UTC. */
export interface ValidatedReply {
  applicationId: number | null;
  category: ReplyCategory;
  confidence: ReplyConfidence;
  summary: string;
  nextStep: { description: string; dueAt: Date | null } | null;
  interview: {
    kind: InterviewKind;
    scheduledAt: Date | null;
    timeZone: string | null;
    link: string | null;
  } | null;
  /** Why the result can't be applied automatically, even with high confidence. */
  issues: string[];
}

function validZone(tz: string | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function resolveLocal(value: string | null, timeZone: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? "09", m[5] ?? "00"].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const at = zonedTimeToUtc(y, mo, d, h, mi, timeZone);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Post-validation (D4): a non-candidate id becomes null; a missing or past interview time stays
 * out of the interview and is flagged, so the policy suggests instead of applying.
 */
export function validateReply(
  raw: ReplyClassification,
  candidates: readonly ApplicationCandidate[],
  ownerTimeZone: string,
  now: Date,
): ValidatedReply {
  const issues: string[] = [];
  let applicationId = raw.application_id;
  if (applicationId !== null && !candidates.some((c) => c.applicationId === applicationId)) {
    issues.push("named an application that was not a candidate");
    applicationId = null;
  }
  let nextStep: ValidatedReply["nextStep"] = null;
  if (raw.next_step) {
    const tz = validZone(raw.next_step.time_zone) ?? ownerTimeZone;
    const due = resolveLocal(raw.next_step.due, tz);
    if (raw.next_step.due && !due) issues.push("next step date could not be read");
    nextStep = { description: raw.next_step.description, dueAt: due };
  }
  let interview: ValidatedReply["interview"] = null;
  if (raw.interview) {
    const tz = validZone(raw.interview.time_zone);
    let scheduledAt: Date | null = null;
    if (raw.interview.scheduled_at) {
      if (!tz) issues.push("interview time has no time zone");
      else {
        scheduledAt = resolveLocal(raw.interview.scheduled_at, tz);
        if (!scheduledAt) issues.push("interview time could not be read");
        else if (scheduledAt.getTime() < now.getTime()) {
          issues.push("interview time is in the past");
          scheduledAt = null;
        }
      }
    }
    interview = {
      kind: raw.interview.kind,
      scheduledAt,
      timeZone: scheduledAt ? tz : null,
      link:
        raw.interview.link && /^https:\/\//i.test(raw.interview.link) ? raw.interview.link : null,
    };
  }
  return {
    applicationId,
    category: raw.category,
    confidence: raw.confidence,
    summary: raw.summary,
    nextStep,
    interview,
    issues,
  };
}

export async function classifyReply(
  deps: StructuredDeps,
  email: ReplyEmail,
  candidates: readonly ApplicationCandidate[],
  opts: { model: string; ownerTimeZone: string; now: Date },
): Promise<{ reply: ValidatedReply; model: string }> {
  const res = await callStructured<ReplyClassification>(deps, {
    kind: "extraction",
    model: opts.model,
    system: REPLY_SYSTEM,
    prompt: buildReplyPrompt(email, candidates, opts.ownerTimeZone),
    schema: replyClassificationSchema,
    schemaName: "reply_classification",
  });
  return {
    reply: validateReply(res.value, candidates, opts.ownerTimeZone, opts.now),
    model: res.model,
  };
}

"use server";

import { zonedTimeToUtc } from "@job-radar/core/time";
import {
  addInterview,
  completeNextStep,
  getApplication,
  getOffer,
  INTERVIEW_TYPES,
  moveStage,
  setNextStep,
  stageExists,
  updateInterview,
  upsertEngagement,
} from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { workerFetch } from "@/lib/worker";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function refresh(offerId?: number) {
  revalidatePath("/pipeline");
  revalidatePath("/");
  if (offerId) revalidatePath(`/offers/${offerId}`);
}

function failure(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

export async function moveApplication(
  applicationId: number,
  stage: string,
  note?: string,
): Promise<ActionResult> {
  try {
    if (!stageExists(db(), stage)) return { ok: false, error: "Unknown stage" };
    const app = moveStage(db(), applicationId, stage, { note: note?.trim() || null });
    refresh(app.offerId);
    // Interview stages get a prep plan in the background (the worker decides and notifies).
    after(() => workerFetch(`/applications/${applicationId}/stage-changed`, { method: "POST" }));
    return { ok: true, message: "Stage updated" };
  } catch (err) {
    return failure(err);
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

const interviewSchema = z.object({
  type: z.enum(INTERVIEW_TYPES),
  date: isoDate,
  time,
  timeZone: z
    .string()
    .min(1)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone"),
  durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
  interviewers: z.string().max(300).optional(),
  link: z.string().max(500).optional(),
  prepNotes: z.string().max(4000).optional(),
  outcome: z.string().max(1000).optional(),
});

export type InterviewForm = z.input<typeof interviewSchema>;

export async function saveInterview(
  applicationId: number,
  form: InterviewForm,
  interviewId?: number,
): Promise<ActionResult> {
  const parsed = interviewSchema.safeParse(form);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  const f = parsed.data;
  const [y = 0, mo = 1, d = 1] = f.date.split("-").map(Number);
  const [h = 0, mi = 0] = f.time.split(":").map(Number);
  const scheduledAt = zonedTimeToUtc(y, mo, d, h, mi, f.timeZone);
  const input = {
    type: f.type,
    scheduledAt,
    timeZone: f.timeZone,
    durationMinutes: f.durationMinutes ?? null,
    interviewers: (f.interviewers ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    link: f.link?.trim() || null,
    prepNotes: f.prepNotes?.trim() || null,
    outcome: f.outcome?.trim() || null,
  };
  try {
    if (interviewId) updateInterview(db(), interviewId, input);
    else addInterview(db(), applicationId, input);
    refresh(getApplication(db(), applicationId)?.offerId);
    return { ok: true, message: interviewId ? "Interview updated" : "Interview added" };
  } catch (err) {
    return failure(err);
  }
}

export async function saveNextStep(
  applicationId: number,
  description: string,
  dueDate: string,
): Promise<ActionResult> {
  const desc = z.string().trim().min(1).max(300).safeParse(description);
  if (!desc.success) return { ok: false, error: "Describe the next step" };
  const due = dueDate ? isoDate.safeParse(dueDate) : null;
  if (due && !due.success) return { ok: false, error: "Invalid due date" };
  try {
    setNextStep(db(), applicationId, {
      description: desc.data,
      dueAt: due?.success ? new Date(`${due.data}T09:00:00Z`) : null,
    });
    refresh(getApplication(db(), applicationId)?.offerId);
    return { ok: true, message: "Next step saved" };
  } catch (err) {
    return failure(err);
  }
}

export async function finishNextStep(applicationId: number): Promise<ActionResult> {
  completeNextStep(db(), applicationId);
  refresh(getApplication(db(), applicationId)?.offerId);
  return { ok: true, message: "Next step done" };
}

/** Follow-up reminder offered with the 14-day no-response suggestion. */
export async function followUpIn(applicationId: number, days: number): Promise<ActionResult> {
  const app = getApplication(db(), applicationId);
  const offer = app ? getOffer(db(), app.offerId) : undefined;
  if (!app || !offer) return { ok: false, error: "Application not found" };
  setNextStep(db(), applicationId, {
    description: `Follow up with ${offer.companyName}`,
    dueAt: new Date(Date.now() + days * 86_400_000),
  });
  refresh(offer.id);
  return { ok: true, message: `Follow-up set in ${days} days` };
}

const engagementSchema = z.object({
  rate: z.coerce.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  ratePeriod: z.enum(["hour", "day", "week", "month", "year", "project"]),
  weeklyHours: z.coerce.number().int().min(1).max(80),
  startDate: isoDate,
  endDate: z.union([isoDate, z.literal("")]).optional(),
  clientContact: z.string().max(300).optional(),
  active: z.boolean(),
});

export type EngagementForm = z.input<typeof engagementSchema>;

export async function saveEngagement(
  applicationId: number,
  form: EngagementForm,
): Promise<ActionResult> {
  const parsed = engagementSchema.safeParse(form);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  const f = parsed.data;
  try {
    upsertEngagement(db(), applicationId, {
      rateMinor: Math.round(f.rate * 100),
      currency: f.currency,
      ratePeriod: f.ratePeriod,
      weeklyHours: f.weeklyHours,
      startDate: f.startDate,
      endDate: f.endDate || null,
      clientContact: f.clientContact?.trim() || null,
      active: f.active,
    });
    refresh(getApplication(db(), applicationId)?.offerId);
    return { ok: true, message: "Engagement saved" };
  } catch (err) {
    return failure(err);
  }
}

/** Generates (or regenerates) the interview prep plan for the current stage. */
export async function generateInterviewPrep(applicationId: number): Promise<ActionResult> {
  const app = getApplication(db(), applicationId);
  if (!app) return { ok: false, error: "Application not found" };
  const res = await workerFetch(`/applications/${applicationId}/prep`, { method: "POST" });
  if (!res.ok) return { ok: false, error: res.error };
  refresh(app.offerId);
  return { ok: true, message: "Interview prep ready" };
}

"use server";

import { readProfileFiles, saveProfileFiles, setPreferenceValues } from "@job-radar/core/profile";
import {
  addCustomStage,
  getSource,
  listStages,
  updateLearningState,
  updateSource,
} from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  applyExclusionsNow,
  cleanCompanyList,
  preferencesWithCompanies,
} from "@/lib/company-exclusions";
import { db } from "@/lib/db";
import { profileDir } from "@/lib/profile";
import { workerFetch } from "@/lib/worker";

export type ActionResult =
  { ok: true; message?: string } | { ok: false; error: string; errors?: string[] };

/** Tell the worker to reload; it validates again and pauses scoring if invalid. */
async function reloadWorker(): Promise<string> {
  const r = await workerFetch("/profile/reload", { method: "POST" });
  return r.ok ? "" : " (the worker will pick it up on its next start)";
}

export async function saveProfileText(files: {
  cv?: string;
  preferences?: string;
}): Promise<ActionResult> {
  const r = saveProfileFiles(profileDir(), files);
  if (!r.ok) return { ok: false, error: "Not saved: fix these fields first", errors: r.errors };
  const note = await reloadWorker();
  revalidatePath("/settings");
  return { ok: true, message: `Saved${note}` };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const formSchema = z
  .object({
    strong: z.coerce.number().int().min(1).max(100),
    possible: z.coerce.number().int().min(0).max(99),
    scoringModel: z.string().trim().min(1),
    draftingModel: z.string().trim().min(1),
    scoringCap: z.coerce.number().int().min(0).max(5000),
    draftsCap: z.coerce.number().int().min(0).max(500),
    researchCap: z.coerce.number().int().min(0).max(100),
    /** Checkbox: "on" when checked, absent when not. */
    autoResearch: z
      .union([z.literal("on"), z.boolean()])
      .optional()
      .transform((v) => v === "on" || v === true),
    quietStart: time,
    quietEnd: time,
    digestTime: time,
    minEUR: z.coerce.number().positive(),
    minUSD: z.coerce.number().positive(),
    minGBP: z.coerce.number().positive(),
    minDailyEUR: z.coerce.number().positive(),
    capacity: z.coerce.number().int().min(1).max(80),
    followUpDays: z
      .string()
      .trim()
      .transform((v) =>
        v
          ? v
              .split(/[\s,;]+/)
              .filter(Boolean)
              .map(Number)
          : [],
      )
      .pipe(
        z
          .array(z.number().int("whole days").min(1, "at least 1 day").max(90, "at most 90 days"))
          .max(5, "at most 5 reminders"),
      ),
  })
  .refine((f) => f.possible < f.strong, {
    message: "possible must be lower than strong",
    path: ["possible"],
  });

export type SettingsForm = z.input<typeof formSchema>;

/** Initial values shown in the form. */
export interface SettingsValues {
  strong: number;
  possible: number;
  scoringModel: string;
  draftingModel: string;
  scoringCap: number;
  draftsCap: number;
  researchCap: number;
  autoResearch: boolean;
  quietStart: string;
  quietEnd: string;
  digestTime: string;
  minEUR: number;
  minUSD: number;
  minGBP: number;
  minDailyEUR: number;
  capacity: number;
  /** Comma-separated, e.g. "7, 14". */
  followUpDays: string;
}

/** Writes individual values into preferences.yaml, keeping its comments and layout. */
export async function saveSettings(form: SettingsForm): Promise<ActionResult> {
  const parsed = formSchema.safeParse(form);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Not saved",
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const f = parsed.data;
  const { preferences } = readProfileFiles(profileDir());
  const updated = setPreferenceValues(preferences, [
    { path: ["scoring", "thresholds", "strong"], value: f.strong },
    { path: ["scoring", "thresholds", "possible"], value: f.possible },
    { path: ["scoring", "models", "scoring"], value: f.scoringModel },
    { path: ["scoring", "models", "drafting"], value: f.draftingModel },
    { path: ["scoring", "daily_caps", "scoring"], value: f.scoringCap },
    { path: ["scoring", "daily_caps", "drafts"], value: f.draftsCap },
    { path: ["scoring", "daily_caps", "research"], value: f.researchCap },
    { path: ["research", "auto_strong"], value: f.autoResearch },
    { path: ["notifications", "quiet_hours", "start"], value: f.quietStart },
    { path: ["notifications", "quiet_hours", "end"], value: f.quietEnd },
    { path: ["notifications", "digest_time"], value: f.digestTime },
    { path: ["rates", "min_hourly", "EUR"], value: f.minEUR },
    { path: ["rates", "min_hourly", "USD"], value: f.minUSD },
    { path: ["rates", "min_hourly", "GBP"], value: f.minGBP },
    { path: ["rates", "min_daily_eur"], value: f.minDailyEUR },
    { path: ["engagement", "weekly_capacity_hours"], value: f.capacity },
    {
      path: ["notifications", "follow_up_days"],
      value: [...new Set(f.followUpDays)].sort((a, b) => a - b),
    },
  ]);
  if (!updated.ok) return { ok: false, error: "Not saved", errors: updated.errors };
  return saveProfileText({ preferences: updated.text });
}

export async function rescoreOpenOffers(): Promise<ActionResult> {
  const r = await workerFetch<{ queued: number }>("/scoring/rescore-open", { method: "POST" });
  if (!r.ok) return { ok: false, error: r.error };
  updateLearningState(db(), { rescoredAt: Date.now() });
  revalidatePath("/settings");
  revalidatePath("/offers");
  return { ok: true, message: `${r.data.queued} open offers queued for rescoring` };
}

const emailSchema = z.object({
  user: z.string().trim().email("enter the mailbox address"),
  label: z.string().trim().min(1).max(100),
  host: z.string().trim().min(1).max(200),
  port: z.coerce.number().int().min(1).max(65535),
  lookbackDays: z.coerce.number().int().min(1).max(30),
});

export async function saveEmailSource(form: z.input<typeof emailSchema>): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(form);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const source = getSource(db(), "email_alerts");
  if (!source) return { ok: false, error: "Start the worker once so the email source exists" };
  const { user, label, host, port, lookbackDays } = parsed.data;
  updateSource(db(), "email_alerts", {
    settings: { ...source.settings, user, label, host, port, lookback_days: lookbackDays },
  });
  revalidatePath("/settings");
  return {
    ok: true,
    message: "Mailbox settings saved (the app password stays in secrets/imap_app_password)",
  };
}

export async function createCustomStage(label: string, after: string): Promise<ActionResult> {
  const l = z.string().trim().min(2).max(60).safeParse(label);
  if (!l.success) return { ok: false, error: "Name the stage (2–60 characters)" };
  const key = l.data
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const stages = listStages(db());
  const anchor = stages.find((s) => s.key === after);
  try {
    addCustomStage(db(), { key, label: l.data, position: (anchor?.position ?? 0) + 5 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not add the stage" };
  }
  revalidatePath("/settings");
  revalidatePath("/pipeline");
  return { ok: true, message: `Stage "${l.data}" added` };
}

export async function startLogin(
  siteId: string,
): Promise<ActionResult & { viewerUrl?: string | null; browserMissing?: boolean }> {
  const r = await workerFetch<{ viewerUrl: string | null; message: string }>(
    `/sessions/${encodeURIComponent(siteId)}/login`,
    {
      method: "POST",
    },
  );
  if (!r.ok) return { ok: false, error: r.error, browserMissing: r.code === "browser_missing" };
  return { ok: true, message: r.data.message, viewerUrl: r.data.viewerUrl };
}

export async function finishLogin(): Promise<ActionResult> {
  const r = await workerFetch<{ site: string; status: string }>("/sessions/done", {
    method: "POST",
  });
  revalidatePath("/settings");
  revalidatePath("/sources");
  if (!r.ok) return { ok: false, error: r.error };
  return r.data.status === "ok"
    ? { ok: true, message: `Logged in to ${r.data.site}` }
    : { ok: false, error: `${r.data.site} still shows its login page; try again` };
}

export async function deleteBrowserProfile(): Promise<ActionResult> {
  const r = await workerFetch("/sessions/delete-profile", { method: "POST" });
  revalidatePath("/settings");
  revalidatePath("/sources");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: "Browser profile deleted: every site is logged out" };
}

export async function checkSiteSession(siteId: string): Promise<ActionResult> {
  const r = await workerFetch<{ site: string; status: string }>(
    `/sessions/${encodeURIComponent(siteId)}/check`,
    {
      method: "POST",
    },
  );
  revalidatePath("/settings");
  revalidatePath("/sources");
  if (!r.ok) return { ok: false, error: r.error };
  return r.data.status === "ok"
    ? { ok: true, message: `${r.data.site}: session is valid` }
    : { ok: false, error: `${r.data.site}: logged out — log in again` };
}

/** Replaces the excluded-companies list (one per line) and applies it to stored offers. */
export async function saveExcludedCompanies(text: string): Promise<ActionResult> {
  if (typeof text !== "string" || text.length > 20_000) return { ok: false, error: "Too long" };
  const list = cleanCompanyList(text.split(/\r?\n/));
  const updated = preferencesWithCompanies(list);
  if (!updated.ok) return { ok: false, error: "Not saved", errors: updated.errors };
  const saved = await saveProfileText({ preferences: updated.text });
  if (!saved.ok) return saved;
  const { hidden, restored } = applyExclusionsNow(list);
  revalidatePath("/offers");
  revalidatePath("/");
  return {
    ok: true,
    message: `Saved ${list.length} compan${list.length === 1 ? "y" : "ies"}: ${hidden} offers hidden, ${restored} restored`,
  };
}

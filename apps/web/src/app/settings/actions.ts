"use server";

import {
  applyPreferenceChanges,
  readProfileFiles,
  saveProfileFiles,
  type PreferenceChange,
  type PreferenceFieldError,
} from "@job-radar/core/profile";
import {
  addCustomStage,
  getSource,
  listStages,
  updateLearningState,
  updateSource,
} from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { applyExclusionsNow, cleanCompanyList } from "@/lib/company-exclusions";
import { db } from "@/lib/db";
import { preferencesHash, profileDir, withoutSources, type PreferenceValues } from "@/lib/profile";
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

const MAX_CHANGES = 200;
const changeSchema = z.union([
  z.object({
    path: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .max(6),
    delete: z.literal(true),
  }),
  z.object({
    path: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .max(6),
    value: z.unknown(),
  }),
]);

/** Fields whose change alters scores; the others (notifications, research, caps) do not. */
function affectsScoring(path: (string | number)[]): boolean {
  const [top, second] = path.map(String);
  if (top === "notifications" || top === "research") return false;
  return !(top === "scoring" && second === "daily_caps");
}

export type PreferencesSaveResult =
  | {
      ok: true;
      message: string;
      hash: string;
      text: string;
      values: PreferenceValues;
      rescoreSuggested: boolean;
    }
  | { ok: false; error: string; errors?: string[]; fieldErrors?: PreferenceFieldError[] };

const STALE = "The preferences file changed since you opened it. Reload the page to see it.";

/**
 * Applies the form's changed fields to preferences.yaml as targeted edits (comments and
 * untouched lines stay as they are). Refuses when the file changed since it was loaded.
 */
export async function savePreferences(input: {
  changes: PreferenceChange[];
  baseHash: string;
}): Promise<PreferencesSaveResult> {
  const changes = z.array(changeSchema).max(MAX_CHANGES).safeParse(input.changes);
  if (!changes.success) return { ok: false, error: "Not saved: malformed changes" };
  const { preferences } = readProfileFiles(profileDir());
  if (preferencesHash(preferences) !== input.baseHash) return { ok: false, error: STALE };
  if (changes.data.some((c) => String(c.path[0]) === "sources"))
    return { ok: false, error: "Per-source settings are edited in the YAML view" };
  const cleaned = (changes.data as PreferenceChange[]).map((c) =>
    c.path.join(".") === "keywords.exclude_companies" && "value" in c && Array.isArray(c.value)
      ? { ...c, value: cleanCompanyList(c.value.map(String)) }
      : c,
  );
  const r = applyPreferenceChanges(preferences, cleaned);
  if (!r.ok)
    return {
      ok: false,
      error: "Not saved: fix these fields first",
      errors: r.errors,
      fieldErrors: r.fieldErrors,
    };
  const saved = await saveProfileText({ preferences: r.text });
  if (!saved.ok) return saved;
  let message = saved.message ?? "Saved";
  if (changes.data.some((c) => c.path.join(".") === "keywords.exclude_companies")) {
    const { hidden, restored } = applyExclusionsNow(r.value.keywords.exclude_companies);
    message += `: ${hidden} offers hidden, ${restored} restored`;
    revalidatePath("/offers");
    revalidatePath("/");
  }
  return {
    ok: true,
    message,
    hash: preferencesHash(r.text),
    text: r.text,
    values: withoutSources(r.value),
    rescoreSuggested: changes.data.some((c) => affectsScoring(c.path)),
  };
}

/** Checks YAML text without saving (used before switching to the form). */
export async function validatePreferencesYaml(
  text: string,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  if (typeof text !== "string" || text.length > 200_000) return { ok: false, errors: ["Too long"] };
  const r = applyPreferenceChanges(text, []);
  return r.ok ? { ok: true } : { ok: false, errors: r.errors };
}

/** Saves the whole YAML text after validation, refusing when the file changed elsewhere. */
export async function savePreferencesYaml(input: {
  text: string;
  baseHash: string;
}): Promise<PreferencesSaveResult> {
  if (typeof input.text !== "string" || input.text.length > 200_000)
    return { ok: false, error: "Too long" };
  const { preferences } = readProfileFiles(profileDir());
  if (preferencesHash(preferences) !== input.baseHash) return { ok: false, error: STALE };
  const r = applyPreferenceChanges(input.text, []);
  if (!r.ok)
    return {
      ok: false,
      error: "Not saved: fix these fields first",
      errors: r.errors,
      fieldErrors: r.fieldErrors,
    };
  const saved = await saveProfileText({ preferences: input.text });
  if (!saved.ok) return saved;
  const { hidden, restored } = applyExclusionsNow(r.value.keywords.exclude_companies);
  if (hidden || restored) {
    revalidatePath("/offers");
    revalidatePath("/");
  }
  return {
    ok: true,
    message: saved.message ?? "Saved",
    hash: preferencesHash(input.text),
    text: input.text,
    values: withoutSources(r.value),
    rescoreSuggested: true,
  };
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
  lookbackDays: z.coerce.number().int().min(1).max(30),
});

/** The job-alert source's look-back; mailboxes are email accounts (job-alert-mailboxes). */
export async function saveEmailSource(form: z.input<typeof emailSchema>): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(form);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const source = getSource(db(), "email_alerts");
  if (!source) return { ok: false, error: "Start the worker once so the email source exists" };
  updateSource(db(), "email_alerts", {
    settings: { ...source.settings, lookback_days: parsed.data.lookbackDays },
  });
  revalidatePath("/settings");
  return { ok: true, message: "Job-alert settings saved" };
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

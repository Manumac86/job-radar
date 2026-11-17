"use server";

import { cleanPreferenceText } from "@job-radar/core/offers";
import { readProfileFiles, setPreferenceValues } from "@job-radar/core/profile";
import {
  createLearnedPreference,
  decideSuggestion,
  editLearnedPreference,
  getLearnedPreference,
  getSuggestion,
  setLearnedStatus,
  supersedeSuggestions,
  updateLearningState,
} from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { profileDir } from "@/lib/profile";
import { workerFetch } from "@/lib/worker";
import { saveProfileText, type ActionResult } from "./actions";

const id = z.number().int().positive();
const polarity = z.enum(["avoid", "prefer"]);

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/offers");
}

/** Owner changes count as a change of the active preferences (rescore banner). */
function changed() {
  updateLearningState(db(), { changedAt: Date.now() });
}

export async function addLearnedPreference(text: string, pol: string): Promise<ActionResult> {
  const p = polarity.safeParse(pol);
  const clean = cleanPreferenceText(text);
  if (!p.success) return { ok: false, error: "Pick avoid or prefer" };
  if ("error" in clean) return { ok: false, error: `Preference ${clean.error}` };
  createLearnedPreference(db(), { text: clean.text, polarity: p.data, origin: "owner" });
  changed();
  refresh();
  return { ok: true, message: "Preference added" };
}

export async function editLearned(
  prefId: number,
  text: string,
  pol: string,
): Promise<ActionResult> {
  const p = polarity.safeParse(pol);
  const clean = cleanPreferenceText(text);
  if (!id.safeParse(prefId).success || !p.success) return { ok: false, error: "Invalid request" };
  if ("error" in clean) return { ok: false, error: `Preference ${clean.error}` };
  if (!editLearnedPreference(db(), prefId, { text: clean.text, polarity: p.data })) {
    return { ok: false, error: "Preference not found" };
  }
  changed();
  refresh();
  return { ok: true, message: "Saved. Learning will keep it as you wrote it." };
}

export async function setLearnedPreferenceStatus(
  prefId: number,
  status: string,
): Promise<ActionResult> {
  const s = z.enum(["active", "disabled", "deleted"]).safeParse(status);
  if (!id.safeParse(prefId).success || !s.success) return { ok: false, error: "Invalid request" };
  const before = getLearnedPreference(db(), prefId);
  if (!before || before.status === "deleted") return { ok: false, error: "Preference not found" };
  setLearnedStatus(db(), prefId, s.data);
  if (before.status === "active" || s.data === "active") changed();
  refresh();
  const message =
    s.data === "deleted"
      ? "Deleted. Job Radar won't learn it again."
      : s.data === "disabled"
        ? "Disabled"
        : "Enabled";
  return { ok: true, message };
}

export async function learnNow(): Promise<ActionResult> {
  const r = await workerFetch<
    | { ran: true; added: string[]; updated: number; retired: number; feedbackUsed: number }
    | { ran: false; reason: string }
  >("/learning/run", { method: "POST" });
  if (!r.ok) return { ok: false, error: r.error };
  refresh();
  if (!r.data.ran) return { ok: true, message: r.data.reason };
  const { added, updated, retired, feedbackUsed } = r.data;
  return {
    ok: true,
    message: `Learned from ${feedbackUsed} decision${feedbackUsed === 1 ? "" : "s"}: ${added.length} new, ${updated} updated, ${retired} retired`,
  };
}

/** Writes the suggested minimum rate to preferences.yaml, then marks it accepted. */
export async function acceptSuggestion(suggestionId: number): Promise<ActionResult> {
  const s = id.safeParse(suggestionId).success ? getSuggestion(db(), suggestionId) : undefined;
  if (!s || s.status !== "pending") return { ok: false, error: "Suggestion not found" };
  const { preferences } = readProfileFiles(profileDir());
  const path =
    s.kind === "raise_min_hourly"
      ? ["rates", "min_hourly", s.currency]
      : ["rates", "min_daily_eur"];
  const updated = setPreferenceValues(preferences, [{ path, value: s.value }]);
  if (!updated.ok) return { ok: false, error: updated.errors.join("; ") };
  const saved = await saveProfileText({ preferences: updated.text });
  if (!saved.ok) return saved;
  decideSuggestion(db(), s.id, "accepted");
  supersedeSuggestions(db(), s.kind, s.currency);
  refresh();
  const what = s.kind === "raise_min_hourly" ? `hourly rate (${s.currency})` : "day rate (EUR)";
  return {
    ok: true,
    message: `Minimum ${what} set to ${s.value}. Rescore open offers to apply it.`,
  };
}

export async function rejectSuggestion(suggestionId: number): Promise<ActionResult> {
  if (!id.safeParse(suggestionId).success || !decideSuggestion(db(), suggestionId, "rejected")) {
    return { ok: false, error: "Suggestion not found" };
  }
  refresh();
  return { ok: true, message: "Suggestion dismissed" };
}

/** Hides the "rescore open offers" banner without rescoring. */
export async function dismissRescoreBanner(): Promise<ActionResult> {
  updateLearningState(db(), { rescoredAt: Date.now() });
  refresh();
  return { ok: true, message: "OK" };
}

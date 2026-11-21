"use server";

import { deleteVariant, loadVariants, saveVariant } from "@job-radar/core/profile";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { profileDir } from "@/lib/profile";
import { workerFetch } from "@/lib/worker";
import type { ActionResult } from "./actions";

const variantInput = z.object({
  id: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1, "Give the variant a name").max(80),
  useFor: z.string().trim().min(1, "Say which offers it is for").max(200),
  text: z.string().trim().min(1, "Paste the CV text").max(20_000, "At most 20,000 characters"),
});

async function reload(): Promise<string> {
  const r = await workerFetch("/profile/reload", { method: "POST" });
  revalidatePath("/settings");
  revalidatePath("/offers", "layout");
  return r.ok ? "" : " (the worker will pick it up on its next start)";
}

/** Adds a CV variant, or saves an existing one (renaming keeps its id). */
export async function saveCvVariant(input: z.input<typeof variantInput>): Promise<ActionResult> {
  const parsed = variantInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Not saved", errors: parsed.error.issues.map((i) => i.message) };
  const r = saveVariant(profileDir(), { ...parsed.data, id: parsed.data.id || undefined });
  if (!r.ok) return { ok: false, error: "Not saved", errors: r.errors };
  return { ok: true, message: `Saved "${parsed.data.name}"${await reload()}` };
}

export async function deleteCvVariant(id: string): Promise<ActionResult> {
  const v = loadVariants(profileDir()).variants.find((x) => x.id === id);
  if (!v || !deleteVariant(profileDir(), id)) return { ok: false, error: "Variant not found" };
  return { ok: true, message: `Deleted "${v.name}"${await reload()}` };
}

/** Rescores shortlisted offers without an application so they get a current recommendation. */
export async function refreshCvRecommendations(): Promise<ActionResult> {
  const r = await workerFetch<{ queued: number }>("/scoring/refresh-cv", { method: "POST" });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/settings");
  revalidatePath("/offers");
  return {
    ok: true,
    message: `${r.data.queued} shortlisted offers queued for a new recommendation`,
  };
}

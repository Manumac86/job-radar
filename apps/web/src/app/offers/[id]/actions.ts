"use server";

import {
  DISMISS_NOTE_MAX,
  DISMISS_REASON_IDS,
  cleanDismissReasons,
  summarizeDismissal,
} from "@job-radar/core/offers";
import { createApplication, getOffer, setTriage } from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  applyExclusionsNow,
  cleanCompanyList,
  currentExcludedCompanies,
  preferencesWithCompanies,
} from "@/lib/company-exclusions";
import { db } from "@/lib/db";
import { workerFetch } from "@/lib/worker";
import { saveProfileText } from "../../settings/actions";
import { cvSentFor } from "@/lib/profile";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const id = z.number().int().positive();

function refresh(offerId: number) {
  revalidatePath(`/offers/${offerId}`);
  revalidatePath("/offers");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

export async function shortlistOffer(offerId: number): Promise<ActionResult> {
  const offer = id.safeParse(offerId).success ? getOffer(db(), offerId) : undefined;
  if (!offer) return { ok: false, error: "Offer not found" };
  setTriage(db(), offerId, "shortlisted");
  // Shortlisting researches the company unless a recent profile exists (company-research spec).
  if (offer.companyId) {
    const companyId = offer.companyId;
    after(() =>
      workerFetch(`/companies/${companyId}/research?reason=shortlist`, {
        method: "POST",
        body: JSON.stringify({ offerId }),
      }),
    );
  }
  refresh(offerId);
  return { ok: true, message: "Shortlisted" };
}

export async function restoreOffer(offerId: number): Promise<ActionResult> {
  if (!getOffer(db(), offerId)) return { ok: false, error: "Offer not found" };
  setTriage(db(), offerId, "new");
  refresh(offerId);
  return { ok: true, message: "Moved back to new" };
}

const dismissInput = z.object({
  reasons: z.array(z.enum(DISMISS_REASON_IDS)).max(DISMISS_REASON_IDS.length),
  note: z.string().trim().max(DISMISS_NOTE_MAX),
  learn: z.boolean(),
  hideCompany: z.boolean().default(false),
});

/** Dismiss with structured reasons (offer-feedback spec); they teach the scoring. */
export async function dismissOffer(
  offerId: number,
  input: z.input<typeof dismissInput>,
): Promise<ActionResult> {
  const r = dismissInput.safeParse(input);
  const offer = id.safeParse(offerId).success ? getOffer(db(), offerId) : undefined;
  if (!r.success || !offer) return { ok: false, error: "Invalid request" };
  const reasons = cleanDismissReasons(r.data.reasons);
  const note = r.data.note || null;
  setTriage(db(), offerId, "dismissed", summarizeDismissal(reasons, note), {
    reasons,
    note,
    learnable: r.data.learn,
  });
  // Suggestions update now; learning starts once enough dismissals are pending.
  after(() => workerFetch("/learning/feedback-added", { method: "POST" }));
  refresh(offerId);
  if (r.data.hideCompany && reasons.includes("company")) {
    const hidden = await hideCompany(offerId);
    if (!hidden.ok) return { ok: false, error: `Dismissed, but hiding failed: ${hidden.error}` };
    return { ok: true, message: `Dismissed. ${hidden.message ?? ""}`.trim() };
  }
  revalidatePath("/settings");
  return {
    ok: true,
    message: r.data.learn ? "Dismissed. Job Radar will learn from it." : "Dismissed",
  };
}

/** The owner sent the application by hand; this only records it. */
export async function markApplied(
  offerId: number,
  draftId: number | null,
  cvId: string | null = null,
): Promise<ActionResult> {
  if (!getOffer(db(), offerId)) return { ok: false, error: "Offer not found" };
  const cv = cvId ? cvSentFor(cvId) : null;
  if (cvId && !cv) return { ok: false, error: "That CV variant no longer exists" };
  try {
    createApplication(db(), { offerId, sentDraftId: draftId, cv });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create the application",
    };
  }
  refresh(offerId);
  return { ok: true, message: "Marked as applied" };
}

export async function generateDraft(
  offerId: number,
  instruction: string,
  cvVariantId: string | null = null,
): Promise<ActionResult> {
  const r = z.string().trim().max(500).safeParse(instruction);
  if (!r.success) return { ok: false, error: "Instruction is too long" };
  if (cvVariantId && !cvSentFor(cvVariantId))
    return { ok: false, error: "That CV variant no longer exists" };
  const res = await workerFetch(`/offers/${offerId}/drafts`, {
    method: "POST",
    body: JSON.stringify({ instruction: r.data || null, cvVariantId }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  refresh(offerId);
  return { ok: true, message: "New draft version ready" };
}

export async function rescoreOffer(offerId: number): Promise<ActionResult> {
  const res = await workerFetch(`/offers/${offerId}/score`, { method: "POST" });
  if (!res.ok) return { ok: false, error: res.error };
  refresh(offerId);
  return { ok: true, message: "Queued for scoring" };
}

/** Adds the offer's company to keywords.exclude_companies and hides its open offers. */
export async function hideCompany(offerId: number): Promise<ActionResult> {
  const offer = getOffer(db(), offerId);
  if (!offer) return { ok: false, error: "Offer not found" };
  const list = cleanCompanyList([...currentExcludedCompanies(), offer.companyName]);
  const updated = preferencesWithCompanies(list);
  if (!updated.ok) return { ok: false, error: updated.errors.join("; ") };
  const saved = await saveProfileText({ preferences: updated.text });
  if (!saved.ok) return saved;
  const { hidden } = applyExclusionsNow(list);
  refresh(offerId);
  revalidatePath("/settings");
  return {
    ok: true,
    message: `${offer.companyName} hidden (${hidden} offer${hidden === 1 ? "" : "s"}). Undo in Settings → Preferences.`,
  };
}

/** "Research company" / "Refresh" / "Retry" on the Company card. */
export async function researchCompany(offerId: number, force = false): Promise<ActionResult> {
  const offer = id.safeParse(offerId).success ? getOffer(db(), offerId) : undefined;
  if (!offer?.companyId) return { ok: false, error: "Offer not found" };
  const res = await workerFetch<{ outcome: "active" | "fresh" | "queued"; error: string | null }>(
    `/companies/${offer.companyId}/research?reason=manual${force ? "&force=1" : ""}`,
    { method: "POST", body: JSON.stringify({ offerId }) },
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh(offerId);
  const message =
    res.data.outcome === "fresh"
      ? "This company was researched recently"
      : res.data.outcome === "active"
        ? "Research is already running"
        : "Researching company…";
  return { ok: true, message };
}

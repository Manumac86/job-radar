"use server";

import { appTimeZone, zonedTimeToUtc } from "@job-radar/core/time";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { workerFetch } from "@/lib/worker";

export type ImportActionResult =
  | { ok: true; offerId: number; message: string }
  | { ok: false; error: string; needsText?: boolean };

const input = z.object({
  url: z.string().trim().min(8, "Paste the offer link").max(2000),
  text: z.string().max(30_000).optional(),
  applied: z.boolean(),
  appliedDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
});

/** Offers → "Add from link": the worker reads the public page and stores the offer. */
export async function importOfferFromLink(
  form: z.input<typeof input>,
): Promise<ImportActionResult> {
  const parsed = input.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const f = parsed.data;
  const appliedAt = f.applied
    ? f.appliedDate
      ? zonedTimeToUtc(
          ...(f.appliedDate.split("-").map(Number) as [number, number, number]),
          12,
          0,
          appTimeZone(),
        ).toISOString()
      : new Date().toISOString()
    : null;
  const res = await workerFetch<{
    offerId: number;
    existed: boolean;
    applicationId: number | null;
  }>("/offers/import", {
    method: "POST",
    body: JSON.stringify({ url: f.url, text: f.text?.trim() || null, appliedAt }),
  });
  if (!res.ok)
    return {
      ok: false,
      error: res.error,
      needsText: res.status === 422 && /paste/i.test(res.error),
    };
  revalidatePath("/offers");
  revalidatePath("/pipeline");
  revalidatePath("/");
  const { offerId, existed, applicationId } = res.data;
  const what = existed ? "Already in Job Radar" : "Offer added";
  return {
    ok: true,
    offerId,
    message: applicationId ? `${what} and marked as applied` : `${what}; scoring it now`,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { workerFetch } from "@/lib/worker";

export type PortalActionResult = { ok: true; message: string } | { ok: false; error: string };

async function act(
  id: number,
  action: "undo" | "apply" | "dismiss",
  body: Record<string, unknown> = {},
): Promise<PortalActionResult> {
  const r = await workerFetch<{ ok: boolean; message: string }>(`/portal/updates/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  revalidatePath("/pipeline");
  revalidatePath("/offers", "layout");
  revalidatePath("/");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: r.data.message };
}

/** Reverts an update made from a portal status (mygreenhouse-source: Undo). */
export async function undoPortalUpdate(id: number): Promise<PortalActionResult> {
  return act(id, "undo");
}

export async function applyPortalUpdate(
  id: number,
  applicationId?: number,
): Promise<PortalActionResult> {
  return act(id, "apply", applicationId ? { applicationId } : {});
}

export async function dismissPortalUpdate(id: number): Promise<PortalActionResult> {
  return act(id, "dismiss");
}

"use server";

import { getSource, updateSource } from "@job-radar/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { workerFetch } from "@/lib/worker";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function runSourceNow(sourceId: string): Promise<ActionResult> {
  const res = await workerFetch<{ result: string; message?: string }>(
    `/sources/${encodeURIComponent(sourceId)}/run`,
    { method: "POST" },
  );
  revalidatePath("/sources");
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: "Run started" };
}

export async function setSourceEnabled(
  sourceId: string,
  enabled: boolean,
  riskAcknowledged = false,
): Promise<ActionResult> {
  const source = getSource(db(), sourceId);
  if (!source) return { ok: false, error: "Source not found" };
  // Logged-in sources need the owner's explicit confirmation of the risk notice (browser-sessions spec).
  if (enabled && source.requiresLogin && !riskAcknowledged) {
    return { ok: false, error: "Confirm the risk notice to enable this source" };
  }
  updateSource(db(), sourceId, {
    enabled,
    ...(enabled && source.requiresLogin ? { riskAcknowledgedAt: new Date() } : {}),
    ...(enabled && source.status === "stopped"
      ? { status: "ok", consecutiveFailures: 0, stoppedUntil: null }
      : {}),
  });
  revalidatePath("/sources");
  return { ok: true, message: enabled ? `${source.name} enabled` : `${source.name} disabled` };
}

export async function setSourceInterval(sourceId: string, minutes: number): Promise<ActionResult> {
  const m = z.number().int().min(15).max(10_080).safeParse(minutes);
  if (!m.success) return { ok: false, error: "Interval must be between 15 minutes and 7 days" };
  updateSource(db(), sourceId, { intervalMinutes: m.data });
  revalidatePath("/sources");
  return { ok: true, message: "Interval saved" };
}

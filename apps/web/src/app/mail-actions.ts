"use server";

import { revalidatePath } from "next/cache";
import { workerFetch } from "@/lib/worker";

export type EmailActionResult = { ok: true; message: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/pipeline");
  revalidatePath("/offers", "layout");
  revalidatePath("/");
}

async function act(
  emailId: number,
  action: "undo" | "apply" | "dismiss",
  body: Record<string, unknown> = {},
): Promise<EmailActionResult> {
  const r = await workerFetch<{ ok: boolean; message: string }>(
    `/mail/emails/${emailId}/${action}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  refresh();
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: r.data.message };
}

/** Reverts an update made from an email (application-emails: Undo). */
export async function undoEmail(emailId: number): Promise<EmailActionResult> {
  return act(emailId, "undo");
}

/** Applies a suggestion, to the application the owner picked when there were several. */
export async function applyEmail(
  emailId: number,
  applicationId?: number,
): Promise<EmailActionResult> {
  return act(emailId, "apply", applicationId ? { applicationId } : {});
}

export async function dismissEmail(emailId: number): Promise<EmailActionResult> {
  return act(emailId, "dismiss");
}

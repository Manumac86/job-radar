"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { workerFetch } from "@/lib/worker";
import type { ActionResult } from "./actions";

const accountInput = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().trim().min(1, "Give the account a name").max(60),
  address: z.string().trim().email("Enter the full email address"),
  host: z
    .string()
    .trim()
    .min(3, "Enter the IMAP server")
    .regex(/^[a-z0-9.-]+$/i, "Enter only the server name, e.g. imap.example.com"),
  port: z.coerce.number().int().min(1).max(65535),
  folders: z.array(z.string().trim().min(1)).min(1).max(10),
  enabled: z.boolean(),
  /** Empty keeps the saved password. */
  password: z.string().max(500),
});

export type MailAccountInput = z.input<typeof accountInput>;

function refresh() {
  revalidatePath("/settings");
}

/** Adds or edits an account. The password goes to the worker, which keeps it in secrets/. */
export async function saveMailAccount(input: MailAccountInput): Promise<ActionResult> {
  const parsed = accountInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Not saved", errors: parsed.error.issues.map((i) => i.message) };
  }
  const { id, password, ...rest } = parsed.data;
  const body = JSON.stringify({ ...rest, ...(password.trim() ? { password } : {}) });
  const r = id
    ? await workerFetch(`/mail/accounts/${id}`, { method: "PATCH", body })
    : await workerFetch("/mail/accounts", { method: "POST", body });
  refresh();
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: `Saved "${rest.label}"` };
}

export async function deleteMailAccount(id: number): Promise<ActionResult> {
  const r = await workerFetch(`/mail/accounts/${id}`, { method: "DELETE" });
  refresh();
  if (!r.ok && r.status !== 204) return { ok: false, error: r.error };
  return { ok: true, message: "Account removed and its password deleted" };
}

export async function testMailAccount(id: number): Promise<ActionResult> {
  const r = await workerFetch<{ ok: boolean; messages?: number; error?: string }>(
    `/mail/accounts/${id}/test`,
    { method: "POST" },
  );
  refresh();
  if (!r.ok) return { ok: false, error: r.error };
  if (!r.data.ok) return { ok: false, error: r.data.error ?? "Connection failed" };
  return { ok: true, message: `Connected (read-only): ${r.data.messages ?? 0} messages in INBOX` };
}

export async function checkMailNow(accountId?: number): Promise<ActionResult> {
  const r = await workerFetch<{
    accounts: number;
    failed: number;
    matched: number;
    classified: number;
    queued: number;
  }>("/mail/check", { method: "POST", body: JSON.stringify(accountId ? { accountId } : {}) });
  refresh();
  revalidatePath("/pipeline");
  if (!r.ok) return { ok: false, error: r.error };
  const s = r.data;
  const parts = [
    `${s.accounts} account${s.accounts === 1 ? "" : "s"} checked`,
    `${s.matched} new repl${s.matched === 1 ? "y" : "ies"}`,
    s.queued ? `${s.queued} waiting for tomorrow's cap` : "",
    s.failed ? `${s.failed} failed` : "",
  ].filter(Boolean);
  return { ok: true, message: parts.join(", ") };
}

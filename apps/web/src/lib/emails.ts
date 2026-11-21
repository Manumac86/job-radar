import "server-only";
import type { ApplicationEmail, SuggestionRow } from "@job-radar/db";

/** Serializable view of a matched email for client components (application-emails). */
export interface EmailView {
  id: number;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  summary: string | null;
  category: string | null;
  status: ApplicationEmail["status"];
  /** "message:" URL that opens the email in Apple Mail; null without a Message-ID. */
  mailUrl: string | null;
  /** Why it was only suggested. */
  reasons: string[];
  candidates: { applicationId: number; label: string }[];
}

/** Apple Mail opens `message://%3C<message-id>%3E`. */
export function mailUrl(messageId: string): string | null {
  if (messageId.startsWith("no-id:")) return null;
  const bare = messageId.trim().replace(/^<|>$/g, "");
  return bare ? `message://%3C${encodeURIComponent(bare)}%3E` : null;
}

export function toEmailView(
  e: ApplicationEmail,
  candidates: SuggestionRow["candidates"] = [],
): EmailView {
  const result = e.result as { decision?: { reasons?: string[] } } | null;
  return {
    id: e.id,
    fromName: e.fromName,
    fromAddress: e.fromAddress,
    subject: e.subject,
    receivedAt: e.receivedAt.toISOString(),
    summary: e.summary,
    category: e.category,
    status: e.status,
    mailUrl: mailUrl(e.messageId),
    reasons: result?.decision?.reasons ?? [],
    candidates: candidates.map((c) => ({
      applicationId: c.applicationId,
      label: `${c.title} at ${c.companyName}`,
    })),
  };
}

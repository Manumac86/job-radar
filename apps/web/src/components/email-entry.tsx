"use client";

import { Mail, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyEmail, dismissEmail, undoEmail, type EmailActionResult } from "@/app/mail-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EmailView } from "@/lib/emails";

const STATUS_LABEL: Record<EmailView["status"], string> = {
  queued: "Waiting to be read",
  auto_applied: "Updated automatically",
  applied: "Applied",
  suggested: "Suggestion",
  dismissed: "Dismissed",
  undone: "Undone",
  timeline_only: "No change",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** One email matched to an application: what it says, what Job Radar did, and the actions. */
export function EmailEntry({ email, compact = false }: { email: EmailView; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>(
    email.candidates.length === 1 ? String(email.candidates[0]?.applicationId) : "",
  );
  const run = (fn: () => Promise<EmailActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  const needsPick = email.status === "suggested" && email.candidates.length > 1;
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm" data-testid="email-entry">
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium [overflow-wrap:anywhere]">
          {email.fromName ?? email.fromAddress}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{when(email.receivedAt)}</span>
        <Badge variant={email.status === "suggested" ? "default" : "secondary"}>
          {STATUS_LABEL[email.status]}
        </Badge>
      </div>
      <p className="text-muted-foreground [overflow-wrap:anywhere]">{email.subject}</p>
      {email.summary ? <p className="[overflow-wrap:anywhere]">{email.summary}</p> : null}
      {email.status === "suggested" && email.reasons.length && !compact ? (
        <p className="text-xs text-muted-foreground">Not applied: {email.reasons.join("; ")}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {email.mailUrl ? (
          <a href={email.mailUrl} className="text-xs underline">
            Open in Mail
          </a>
        ) : null}
        {email.status === "auto_applied" || email.status === "applied" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => undoEmail(email.id))}
          >
            <Undo2 aria-hidden /> Undo
          </Button>
        ) : null}
        {email.status === "suggested" ? (
          <>
            {needsPick ? (
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger size="sm" className="w-56" aria-label="Application for this email">
                  <SelectValue placeholder="Which application?" />
                </SelectTrigger>
                <SelectContent>
                  {email.candidates.map((c) => (
                    <SelectItem key={c.applicationId} value={String(c.applicationId)}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button
              size="sm"
              disabled={pending || (needsPick && !pick)}
              onClick={() => run(() => applyEmail(email.id, pick ? Number(pick) : undefined))}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => dismissEmail(email.id))}
            >
              Dismiss
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

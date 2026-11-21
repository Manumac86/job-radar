"use client";

import { Globe, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  applyPortalUpdate,
  dismissPortalUpdate,
  undoPortalUpdate,
  type PortalActionResult,
} from "@/app/portal-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PortalUpdateView } from "@/lib/portal-updates";

const STATE_LABEL: Record<PortalUpdateView["state"], string> = {
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

/** One portal status (MyGreenhouse): what it says, what Job Radar did, and the actions. */
export function PortalEntry({
  update,
  compact = false,
}: {
  update: PortalUpdateView;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>(
    update.candidates.length === 1 ? String(update.candidates[0]?.applicationId) : "",
  );
  const run = (fn: () => Promise<PortalActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  const suggested = update.state === "suggested";
  const needsPick = suggested && update.candidates.length > 1;
  const target = update.targetLabel;
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm" data-testid="portal-entry">
      <div className="flex flex-wrap items-center gap-2">
        <Globe className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">{update.portal}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{when(update.seenAt)}</span>
        <Badge variant={suggested ? "default" : "secondary"}>{STATE_LABEL[update.state]}</Badge>
      </div>
      <p className="text-muted-foreground [overflow-wrap:anywhere]">
        {update.title} at {update.company}
      </p>
      <p className="[overflow-wrap:anywhere]">
        Status: {update.status}
        {target && suggested ? ` → move to ${target}?` : ""}
        {target && (update.state === "auto_applied" || update.state === "applied")
          ? ` · moved to ${target}`
          : ""}
      </p>
      {suggested && update.reasons.length && !compact ? (
        <p className="text-xs text-muted-foreground">Not applied: {update.reasons.join("; ")}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {update.url ? (
          <a href={update.url} target="_blank" rel="noreferrer" className="text-xs underline">
            Open the job
          </a>
        ) : null}
        {update.state === "auto_applied" || update.state === "applied" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => undoPortalUpdate(update.id))}
          >
            <Undo2 aria-hidden /> Undo
          </Button>
        ) : null}
        {suggested ? (
          <>
            {needsPick ? (
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger size="sm" className="w-56" aria-label="Application for this update">
                  <SelectValue placeholder="Which application?" />
                </SelectTrigger>
                <SelectContent>
                  {update.candidates.map((c) => (
                    <SelectItem key={c.applicationId} value={String(c.applicationId)}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {update.targetStage ? (
              <Button
                size="sm"
                disabled={pending || (needsPick && !pick)}
                onClick={() =>
                  run(() => applyPortalUpdate(update.id, pick ? Number(pick) : undefined))
                }
              >
                Apply
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => dismissPortalUpdate(update.id))}
            >
              Dismiss
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

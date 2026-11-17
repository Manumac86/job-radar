"use client";

import { Ban, Check, Copy, ExternalLink, Send, Star, Undo2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  dismissOffer,
  hideCompany,
  markApplied,
  restoreOffer,
  shortlistOffer,
  type ActionResult,
} from "./actions";
import { DismissDialog } from "./dismiss-dialog";

interface DraftRef {
  id: number;
  version: number;
  message: string;
}

const NONE = "none";

export function OfferActions({
  offerId,
  companyName,
  sourceUrl,
  triage,
  hasApplication,
  drafts,
}: {
  offerId: number;
  companyName: string;
  sourceUrl: string;
  triage: string;
  hasApplication: boolean;
  drafts: DraftRef[];
}) {
  const [pending, start] = useTransition();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [draftChoice, setDraftChoice] = useState(drafts[0] ? String(drafts[0].id) : NONE);

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Done");
        after?.();
      } else toast.error(r.error);
    });

  const copy = async () => {
    const latest = drafts[0];
    if (!latest) return;
    await navigator.clipboard.writeText(latest.message);
    toast.success(`Draft v${latest.version} copied`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={copy} disabled={!drafts.length}>
        <Copy aria-hidden /> Copy draft
      </Button>
      <Button variant="outline" asChild>
        <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
          <ExternalLink aria-hidden /> Open offer page
        </a>
      </Button>
      {triage === "shortlisted" || triage === "dismissed" ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => restoreOffer(offerId))}
        >
          <Undo2 aria-hidden /> {triage === "dismissed" ? "Restore" : "Back to new"}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => shortlistOffer(offerId))}
        >
          <Star aria-hidden /> Shortlist
        </Button>
      )}
      {triage !== "dismissed" ? (
        <Button variant="outline" disabled={pending} onClick={() => setDismissOpen(true)}>
          <X aria-hidden /> Dismiss
        </Button>
      ) : null}
      {!hasApplication ? (
        <Button
          variant="outline"
          disabled={pending}
          title={`Hide every offer from ${companyName}`}
          onClick={() => run(() => hideCompany(offerId))}
        >
          <Ban aria-hidden /> Hide company
        </Button>
      ) : null}
      {hasApplication ? (
        <Button disabled>
          <Check aria-hidden /> Applied
        </Button>
      ) : (
        <Button disabled={pending} onClick={() => setAppliedOpen(true)}>
          <Send aria-hidden /> Mark as applied
        </Button>
      )}

      {dismissOpen ? (
        <DismissDialog
          open
          onOpenChange={setDismissOpen}
          companyName={companyName}
          canHideCompany={!hasApplication}
          pending={pending}
          onConfirm={(input) =>
            run(
              () => dismissOffer(offerId, input),
              () => setDismissOpen(false),
            )
          }
        />
      ) : null}

      <Dialog open={appliedOpen} onOpenChange={setAppliedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as applied</DialogTitle>
            <DialogDescription>
              Use this after you sent the application yourself on the site. Job Radar never submits
              anything.
            </DialogDescription>
          </DialogHeader>
          <Label>Draft version you sent</Label>
          <Select value={draftChoice} onValueChange={setDraftChoice}>
            <SelectTrigger aria-label="Draft version you sent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {drafts.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  Draft v{d.version}
                </SelectItem>
              ))}
              <SelectItem value={NONE}>No draft / wrote my own</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAppliedOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => markApplied(offerId, draftChoice === NONE ? null : Number(draftChoice)),
                  () => setAppliedOpen(false),
                )
              }
            >
              Confirm applied
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import {
  DISMISS_NOTE_MAX,
  DISMISS_REASONS,
  learnableByDefault,
  type DismissReason,
} from "@job-radar/core/offers";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface DismissInput {
  reasons: DismissReason[];
  note: string;
  learn: boolean;
  hideCompany: boolean;
}

/** Structured dismiss reasons (offer-feedback spec). */
export function DismissDialog({
  open,
  onOpenChange,
  companyName,
  canHideCompany,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  canHideCompany: boolean;
  pending: boolean;
  onConfirm: (input: DismissInput) => void;
}) {
  const [reasons, setReasons] = useState<DismissReason[]>([]);
  const [note, setNote] = useState("");
  const [learn, setLearn] = useState(true);
  // Until the owner flips the switch, it follows the reasons (off for duplicate only).
  const [learnTouched, setLearnTouched] = useState(false);
  const [hide, setHide] = useState(false);

  const changeReasons = (next: string[]) => {
    const r = next as DismissReason[];
    setReasons(r);
    if (!learnTouched) setLearn(learnableByDefault(r));
    if (!r.includes("company")) setHide(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss offer</DialogTitle>
          <DialogDescription>
            Pick what made it a no. Job Radar learns from your reasons and scores similar offers
            lower.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label id="dismiss-reasons-label">Why? (pick the real reason, not all of them)</Label>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            spacing={2}
            value={reasons}
            onValueChange={changeReasons}
            aria-labelledby="dismiss-reasons-label"
            className="w-full flex-wrap justify-start"
          >
            {DISMISS_REASONS.map((r) => (
              <ToggleGroupItem key={r.id} value={r.id} aria-label={r.label}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {canHideCompany && reasons.includes("company") ? (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={hide} onCheckedChange={(v) => setHide(v === true)} />
            Hide all offers from {companyName}
          </Label>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="dismiss-note">Note (optional)</Label>
          <Textarea
            id="dismiss-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={DISMISS_NOTE_MAX}
            placeholder='Be specific: "needs 4 h overlap with PST", "unfunded 5-person startup"'
            className="max-h-40"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="dismiss-learn">Learn from this</Label>
            <p className="text-sm text-muted-foreground">
              Turn off for one-off reasons (already talked to them, no time right now).
            </p>
          </div>
          <Switch
            id="dismiss-learn"
            checked={learn}
            onCheckedChange={(v) => {
              setLearnTouched(true);
              setLearn(v);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => onConfirm({ reasons, note, learn, hideCompany: hide })}
          >
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

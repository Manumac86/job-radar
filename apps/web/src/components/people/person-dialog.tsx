"use client";

// The person form, shared by offers, the pipeline drawer and the People page (people-directory D7).
import { useState } from "react";
import type { PersonView } from "@/app/offers/[id]/people-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  ["name", "Name", "Jane Roe"],
  ["role", "Role", "Recruiter, hiring manager, referral…"],
  ["company", "Company", "Where they work (optional)"],
  ["linkedinUrl", "LinkedIn", "https://www.linkedin.com/in/…"],
  ["email", "Email", ""],
  ["phone", "Phone", ""],
  ["other", "Other contact", "Telegram, WhatsApp, Slack…"],
] as const;

export type FieldKey = (typeof FIELDS)[number][0] | "note";
export type PersonDraft = Record<FieldKey, string>;

export function draftOf(p: PersonView | null, defaults: Partial<PersonDraft> = {}): PersonDraft {
  return {
    name: p?.name ?? "",
    role: p?.role ?? "",
    company: p ? (p.companyName ?? "") : "",
    linkedinUrl: p?.linkedinUrl ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    other: p?.other ?? "",
    note: p?.note ?? "",
    ...defaults,
  };
}

export function PersonDialog({
  person,
  initial,
  pending,
  errors,
  duplicate,
  useDuplicateLabel = "Use",
  onUseDuplicate,
  onSave,
  onClose,
}: {
  person: PersonView | null;
  initial: PersonDraft;
  pending: boolean;
  errors: Record<string, string>;
  /** Someone else already has this LinkedIn profile or email (people-directory D4). */
  duplicate?: PersonView | null;
  useDuplicateLabel?: string;
  onUseDuplicate?: (p: PersonView) => void;
  onSave: (draft: PersonDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PersonDraft>(initial);
  const set = (k: FieldKey) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? `Edit ${person.name}` : "Add person"}</DialogTitle>
          <DialogDescription>
            Kept only on this computer. Job Radar never contacts anyone.
          </DialogDescription>
        </DialogHeader>
        {duplicate ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm"
          >
            <span>
              {duplicate.name}
              {duplicate.companyName ? ` (${duplicate.companyName})` : ""} already has this contact.
            </span>
            {onUseDuplicate ? (
              <Button size="sm" variant="outline" onClick={() => onUseDuplicate(duplicate)}>
                {useDuplicateLabel} {duplicate.name}
              </Button>
            ) : null}
          </div>
        ) : null}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft);
          }}
        >
          {FIELDS.map(([key, label, placeholder]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`person-${key}`}>{label}</Label>
              <Input
                id={`person-${key}`}
                value={draft[key]}
                onChange={set(key)}
                placeholder={placeholder}
                aria-invalid={errors[key] ? true : undefined}
                required={key === "name"}
              />
              {errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null}
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="person-note">Note</Label>
            <Textarea id="person-note" value={draft.note} onChange={set("note")} rows={2} />
            {errors["note"] ? <p className="text-xs text-destructive">{errors["note"]}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !draft.name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

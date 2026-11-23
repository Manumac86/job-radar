"use client";

// "Add note" on any offer, applied or not (offer-notes-and-people D1). Notes are timeline
// entries: append-only, so a correction is a new note.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addOfferNote } from "@/app/offers/[id]/people-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ offerId, onAdded }: { offerId: number; onAdded?: () => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await addOfferNote(offerId, text);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setText("");
      onAdded?.();
    });
  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) submit();
        }}
        placeholder="Add a note to the timeline (e.g. contacted on Telegram)"
        aria-label="Note"
        rows={2}
        maxLength={2000}
      />
      <div className="flex justify-end">
        <Button size="sm" disabled={pending || !text.trim()} onClick={submit}>
          Add note
        </Button>
      </div>
    </div>
  );
}

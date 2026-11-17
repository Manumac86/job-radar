"use client";

import { Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-time-pickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importOfferFromLink } from "./import-actions";

const today = () => new Date().toLocaleDateString("sv-SE");

/** Offers → "Add from link": paste the URL of an offer, e.g. one you applied to on LinkedIn. */
export function ImportOfferDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [applied, setApplied] = useState(true);
  const [appliedDate, setAppliedDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setUrl("");
    setText("");
    setShowText(false);
    setError(null);
    setApplied(true);
    setAppliedDate(today());
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await importOfferFromLink({ url, text, applied, appliedDate });
      if (!r.ok) {
        setError(r.error);
        if (r.needsText) setShowText(true);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      reset();
      router.push(`/offers/${r.offerId}`);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Link2 aria-hidden /> Add from link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an offer from a link</DialogTitle>
          <DialogDescription>
            Paste the link of an offer, for example one you applied to on LinkedIn. Job Radar reads
            the public page once (no login), fills in the offer and scores it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          aria-label="Add offer from link"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="import-url">Offer link</Label>
            <Input
              id="import-url"
              type="url"
              inputMode="url"
              autoFocus
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.linkedin.com/jobs/view/…"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="import-applied"
                checked={applied}
                onCheckedChange={(v) => setApplied(v === true)}
              />
              <Label htmlFor="import-applied">I already applied</Label>
            </div>
            {applied ? (
              <DatePicker
                value={appliedDate}
                onChange={setAppliedDate}
                clearable={false}
                aria-label="Applied on"
                className="w-52"
              />
            ) : null}
          </div>
          {showText ? (
            <div className="space-y-1.5">
              <Label htmlFor="import-text">Offer text (optional)</Label>
              <Textarea
                id="import-text"
                rows={6}
                // Long offers scroll inside the box so the dialog and its button stay on screen.
                className="max-h-64 overflow-y-auto"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="If the page needs a login, open it, select all the offer text and paste it here."
              />
            </div>
          ) : (
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setShowText(true)}
            >
              The page needs a login? Paste the offer text instead
            </button>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !url.trim()}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {pending ? "Reading the offer…" : "Add offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

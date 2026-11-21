"use client";

import { Import, Loader2 } from "lucide-react";
import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { importOfferFromLink, importSimpleApplyCsv, type CsvImportCounts } from "./import-actions";

const today = () => new Date().toLocaleDateString("sv-SE");

/** Offers → "Import": an offer from its link, or a SimpleApply "Export CSV" file. */
export function ImportOfferDialog() {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResetKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Import aria-hidden /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import offers</DialogTitle>
          <DialogDescription>
            Add one offer from its link, or the matches exported from SimpleApply.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="link" key={resetKey}>
          <TabsList>
            <TabsTrigger value="link">From a link</TabsTrigger>
            <TabsTrigger value="simpleapply">SimpleApply CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="link">
            <LinkImportForm onDone={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="simpleapply">
            <SimpleApplyCsvForm onDone={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Paste the URL of an offer, e.g. one you applied to on LinkedIn. */
function LinkImportForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
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
      onDone();
      reset();
      router.push(`/offers/${r.offerId}`);
    });

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Paste the link of an offer, for example one you applied to on LinkedIn. Job Radar reads the
        public page once (no login), fills in the offer and scores it.
      </p>
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
    </>
  );
}

/** A SimpleApply "Export CSV" file: read locally by the worker, no request to SimpleApply. */
function SimpleApplyCsvForm({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [counts, setCounts] = useState<CsvImportCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      if (!file) return;
      setError(null);
      setCounts(null);
      const form = new FormData();
      form.set("file", file);
      const r = await importSimpleApplyCsv(form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCounts(r.counts);
      router.refresh();
    });

  return (
    <form
      className="space-y-4"
      aria-label="Import SimpleApply CSV"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-muted-foreground">
        In SimpleApply, click <strong>Export CSV</strong> and choose the file here. Job Radar reads
        the file only: it never applies or changes anything on SimpleApply. Rows go through the
        usual duplicate check, keyword filter and scoring.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="simpleapply-file">SimpleApply export (.csv)</Label>
        <Input
          id="simpleapply-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setCounts(null);
            setError(null);
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {counts ? (
        <div role="status" className="space-y-1 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {counts.new} new · {counts.duplicates} already known · {counts.filtered} filtered ·{" "}
            {counts.invalid} invalid
          </p>
          {counts.applications ? (
            <p className="text-muted-foreground">
              {counts.applications} marked as applied in the pipeline
            </p>
          ) : null}
          <Link
            className="underline underline-offset-4"
            href="/offers?source=simpleapply"
            onClick={onDone}
          >
            See SimpleApply offers
          </Link>
        </div>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={pending || !file}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? "Importing…" : "Import file"}
        </Button>
      </DialogFooter>
    </form>
  );
}

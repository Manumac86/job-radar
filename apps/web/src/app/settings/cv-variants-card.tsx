"use client";

import { AlertTriangle, FilePlus2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ActionResult } from "./actions";
import { deleteCvVariant, refreshCvRecommendations, saveCvVariant } from "./cv-variants-actions";

export interface CvVariantView {
  id: string;
  name: string;
  useFor: string;
  text: string;
}

const MAX = 8;
const EMPTY = { id: "", name: "", useFor: "", text: "" };

export function CvVariantsCard({
  variants,
  errors,
  staleCount,
}: {
  variants: CvVariantView[];
  /** Variant files that were skipped (bad header, empty, too long…). */
  errors: string[];
  /** Shortlisted offers whose recommendation used other variants. */
  staleCount: number;
}) {
  const [editing, setEditing] = useState<CvVariantView | null>(null);
  const [deleting, setDeleting] = useState<CvVariantView | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setFormErrors([]);
        after?.();
      } else {
        setFormErrors(r.errors ?? [r.error]);
        toast.error(r.error);
      }
    });

  return (
    <Card data-testid="cv-variants">
      <CardHeader>
        <CardTitle>CV variants</CardTitle>
        <CardDescription>
          Versions of your CV that stress different experience. Scoring still judges fit on the CV
          above and recommends which variant to send for each offer, with what it may be missing.
          Drafts lead with the chosen variant; facts always come from the CV above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden />
            <AlertTitle>Skipped files</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No variants yet. With none, Job Radar works with the single CV above.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {variants.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{v.name}</p>
                  <p className="text-sm text-muted-foreground">For: {v.useFor}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.text.length.toLocaleString("en")} characters · cvs/{v.id}.md
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${v.name}`}
                    onClick={() => {
                      setFormErrors([]);
                      setEditing(v);
                    }}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${v.name}`}
                    onClick={() => setDeleting(v)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={variants.length >= MAX}
            onClick={() => {
              setFormErrors([]);
              setEditing(EMPTY);
            }}
          >
            <FilePlus2 aria-hidden /> Add variant
          </Button>
          {staleCount > 0 && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => refreshCvRecommendations())}
            >
              <RefreshCw aria-hidden /> Refresh CV recommendations ({staleCount})
            </Button>
          )}
        </div>
        {staleCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Your variants changed. Refreshing rescores the {staleCount} shortlisted offer
            {staleCount === 1 ? "" : "s"} without an application, within the daily scoring cap. New
            offers use the current variants automatically.
          </p>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Edit ${editing.name}` : "Add a CV variant"}</DialogTitle>
            <DialogDescription>
              Paste the CV text in Markdown. Renaming keeps the variant&apos;s id, so past
              applications still point to it.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              aria-label="CV variant"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(
                  () =>
                    saveCvVariant({
                      id: editing.id || undefined,
                      name: String(f.get("name") ?? ""),
                      useFor: String(f.get("useFor") ?? ""),
                      text: String(f.get("text") ?? ""),
                    }),
                  () => setEditing(null),
                );
              }}
            >
              {formErrors.length > 0 && (
                <p className="text-sm text-destructive" role="alert">
                  {formErrors.join("; ")}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="cv-variant-name">Name</Label>
                  <Input id="cv-variant-name" name="name" defaultValue={editing.name} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cv-variant-use">Use for</Label>
                  <Input
                    id="cv-variant-use"
                    name="useFor"
                    defaultValue={editing.useFor}
                    placeholder="e.g. Head of / Lead roles at startups"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-variant-text">CV text (Markdown)</Label>
                <Textarea
                  id="cv-variant-text"
                  name="text"
                  defaultValue={editing.text}
                  className="h-72 font-mono text-xs"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Save variant
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              The file cvs/{deleting?.id}.md is removed. Applications that recorded it as sent keep
              showing its name.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const id = deleting?.id;
                if (id)
                  run(
                    () => deleteCvVariant(id),
                    () => setDeleting(null),
                  );
              }}
            >
              Delete variant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

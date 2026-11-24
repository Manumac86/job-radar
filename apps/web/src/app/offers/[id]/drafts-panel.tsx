"use client";

import { Building2, Copy, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateDraft } from "./actions";
import { copyText } from "@/lib/clipboard";

export interface DraftView {
  id: number;
  version: number;
  message: string;
  screeningAnswers: { question: string; answer: string }[];
  suggestedRate: { amount: number; currency: string; period: string; reasoning: string } | null;
  verifyBeforeSending: string[];
  companyFactsUsed: { fact: string; source: string }[];
  instruction: string | null;
  model: string;
  createdAt: string;
  /** Name of the CV variant the draft was written for, when variants exist. */
  cvVariantName?: string | null;
}

export function DraftsPanel({
  offerId,
  drafts,
  cvOptions = [],
  recommendedCv = null,
}: {
  offerId: number;
  drafts: DraftView[];
  /** Master CV first, then the variants; empty when the owner has no variants. */
  cvOptions?: { id: string; name: string }[];
  recommendedCv?: string | null;
}) {
  const [selected, setSelected] = useState(drafts[0] ? String(drafts[0].id) : "");
  const [instruction, setInstruction] = useState("");
  const [cv, setCv] = useState(
    recommendedCv && cvOptions.some((o) => o.id === recommendedCv) ? recommendedCv : "master",
  );
  const [pending, start] = useTransition();
  const draft = drafts.find((d) => String(d.id) === selected) ?? drafts[0];

  const regenerate = () =>
    start(async () => {
      const r = await generateDraft(offerId, instruction, cvOptions.length ? cv : null);
      if (r.ok) {
        toast.success(r.message ?? "Draft ready");
        setInstruction("");
        setSelected("");
      } else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Draft</CardTitle>
        {drafts.length > 1 ? (
          <Select value={draft ? String(draft.id) : ""} onValueChange={setSelected}>
            <SelectTrigger className="w-40" aria-label="Draft version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {drafts.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  v{d.version}
                  {d.instruction ? ` · ${d.instruction.slice(0, 18)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {draft ? (
          <>
            <div
              className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap"
              data-testid="draft-message"
            >
              {draft.message}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                v{draft.version} · {draft.model} · {draft.createdAt}
              </span>
              {draft.cvVariantName ? (
                <span data-testid="draft-cv">Written for CV: {draft.cvVariantName}</span>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await copyText(draft.message, `Draft v${draft.version} copied`);
                }}
              >
                <Copy aria-hidden /> Copy
              </Button>
            </div>
            {draft.screeningAnswers.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Screening answers</h3>
                {draft.screeningAnswers.map((a) => (
                  <div key={a.question} className="text-sm">
                    <p className="font-medium">{a.question}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{a.answer}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {draft.suggestedRate ? (
              <p className="text-sm">
                Suggested rate:{" "}
                <strong>
                  {draft.suggestedRate.amount} {draft.suggestedRate.currency}/
                  {draft.suggestedRate.period}
                </strong>
                <span className="text-muted-foreground"> — {draft.suggestedRate.reasoning}</span>
              </p>
            ) : null}
            {draft.companyFactsUsed.length ? (
              <div className="space-y-1" data-testid="draft-company-facts">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <Building2 className="size-4" aria-hidden /> Company facts used
                </h3>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {draft.companyFactsUsed.map((f) => (
                    <li key={f.fact}>
                      {f.fact}{" "}
                      <a
                        href={f.source}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline"
                      >
                        source <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {draft.verifyBeforeSending.length ? (
              <div className="rounded-md border border-possible/40 bg-possible/10 p-3">
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                  <ShieldAlert className="size-4" aria-hidden /> Verify before sending
                </h3>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {draft.verifyBeforeSending.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No draft yet. Strong matches get one automatically.
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          {cvOptions.length ? (
            <Select value={cv} onValueChange={setCv}>
              <SelectTrigger className="w-full sm:w-48" aria-label="CV to write for">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cvOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.id === recommendedCv ? " (recommended)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              draft ? 'Instruction, e.g. "shorter, emphasize RAG"' : "Optional instruction"
            }
            maxLength={500}
            aria-label="Instruction for the next draft"
          />
          <Button onClick={regenerate} disabled={pending} variant={draft ? "outline" : "default"}>
            <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
            {draft ? "Regenerate" : "Generate draft"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

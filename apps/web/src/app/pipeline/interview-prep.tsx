"use client";

import { appTimeZone } from "@job-radar/core/time";
import type { CompanyContextData, InterviewPlanData } from "@job-radar/db";
import { AlertTriangle, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateInterviewPrep } from "./actions";
import type { CardData } from "./board";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: appTimeZone(),
});

function List({ title, items }: { title: string; items: React.ReactNode[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function SourceLink({ url }: { url: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground underline"
    >
      source <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

/** Company facts from research, each with its source (company-research spec). */
function CompanyContext({ context }: { context: InterviewPlanData["company_context"] }) {
  if (!context) return null;
  if ("unavailable" in context)
    return (
      <p className="text-xs text-muted-foreground" data-testid="prep-company-context">
        Company context: {context.unavailable}.
      </p>
    );
  const c: CompanyContextData = context;
  const items: React.ReactNode[] = [
    c.product ? (
      <>
        <span className="font-medium">Product:</span> {c.product.text}
        <SourceLink url={c.product.source} />
      </>
    ) : null,
    c.stage ? (
      <>
        <span className="font-medium">Stage:</span> {c.stage.text}
        <SourceLink url={c.stage.source} />
      </>
    ) : null,
    ...c.news.map((n) => (
      <>
        <span className="text-muted-foreground tabular-nums">{n.date}</span> {n.headline}
        <SourceLink url={n.source} />
      </>
    )),
    ...c.red_flags.map((r) => (
      <span className="text-destructive">
        {r.text}
        <SourceLink url={r.source} />
      </span>
    )),
  ].filter(Boolean);
  return (
    <div data-testid="prep-company-context">
      <List title="Company context" items={items} />
      {!items.length ? (
        <p className="text-xs text-muted-foreground">Company research found no sourced facts.</p>
      ) : null}
    </div>
  );
}

/** AI interview preparation for the current stage (application-pipeline spec). */
export function InterviewPrepSection({ card }: { card: CardData }) {
  const [pending, start] = useTransition();
  const prep = card.prep;
  const stale = prep && prep.stage !== card.stage;
  const generate = () =>
    start(async () => {
      const r = await generateInterviewPrep(card.id);
      if (r.ok) toast.success(r.message ?? "Ready");
      else toast.error(r.error);
    });
  return (
    <section className="space-y-3" aria-label="Interview prep">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Interview prep</h3>
        {card.canPrepare || prep ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={generate}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {pending
              ? "Preparing… (up to a few minutes with company research)"
              : prep
                ? "Regenerate"
                : "Generate"}
          </Button>
        ) : null}
      </div>
      {!prep ? (
        <p className="text-sm text-muted-foreground">
          {card.canPrepare
            ? "No plan yet for this stage. Generate one: likely questions, strengths from your CV, gaps and questions to ask."
            : "A plan is generated automatically when you move this application to an interview stage."}
        </p>
      ) : (
        <div className="space-y-4 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            For {prep.stageLabel} · {when.format(new Date(prep.createdAt))}
            {stale ? " · the stage has changed since; regenerate for the current round" : ""}
          </p>
          <p className="text-sm">{prep.plan.focus}</p>
          <CompanyContext context={prep.plan.company_context} />
          {prep.plan.verify.length ? (
            <Alert>
              <AlertTriangle aria-hidden />
              <AlertTitle>Check before the interview</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {prep.plan.verify.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Likely questions
            </h4>
            {prep.plan.likely_questions.map((q) => (
              <details key={q.question} className="rounded-md border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">{q.question}</summary>
                <p className="mt-1 text-xs text-muted-foreground">{q.why_they_ask}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {q.answer_outline.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          <List
            title="Strengths to highlight"
            items={prep.plan.strengths_to_highlight.map((s) => (
              <>
                <span className="font-medium">{s.point}</span>
                <span className="text-muted-foreground"> — {s.cv_evidence}</span>
              </>
            ))}
          />
          <List
            title="Gaps to prepare"
            items={prep.plan.gaps_to_prepare.map((g) => (
              <>
                <span className="font-medium">{g.gap}</span>
                <span className="text-muted-foreground"> — {g.how_to_prepare}</span>
              </>
            ))}
          />
          <List title="Questions to ask" items={prep.plan.questions_to_ask} />
          <List title="Checklist" items={prep.plan.checklist} />
        </div>
      )}
    </section>
  );
}

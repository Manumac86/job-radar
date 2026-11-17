"use client";

import { AlertTriangle, Building2, ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyCardData } from "@/lib/research";
import { researchCompany } from "./actions";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Sources({ urls }: { urls: string[] }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-x-2">
      {urls.map((u) => (
        <a
          key={u}
          href={u}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline"
          data-testid="company-source"
        >
          {hostOf(u)} <ExternalLink className="size-3" aria-hidden />
        </a>
      ))}
    </span>
  );
}

export function CompanyCard({
  offerId,
  companyName,
  data,
}: {
  offerId: number;
  companyName: string;
  data: CompanyCardData;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const busy = data.state === "queued" || data.state === "running";
  const waitingForCap = busy && data.message?.includes("daily limit");

  // While research runs, refresh until it finishes.
  useEffect(() => {
    if (!busy || waitingForCap) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, waitingForCap, router]);

  const run = (force: boolean) =>
    start(async () => {
      const r = await researchCompany(offerId, force);
      if (r.ok) toast.success(r.message ?? "Researching company…");
      else toast.error(r.error);
      router.refresh();
    });

  const hasProfile = data.researched !== null;
  return (
    <Card data-testid="company-card" data-state={data.state}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4" aria-hidden /> Company
        </CardTitle>
        {data.partial ? <Badge variant="outline">Partial</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.message ? (
          <p
            className={data.state === "failed" ? "text-destructive" : "text-muted-foreground"}
            data-testid="research-status"
          >
            {data.message}
          </p>
        ) : null}
        {data.limited ? (
          <p className="text-xs text-muted-foreground">Limited research: web search unavailable.</p>
        ) : null}
        {data.website ? (
          <p className="text-xs text-muted-foreground">
            Identified as{" "}
            <a href={data.website} target="_blank" rel="noreferrer noopener" className="underline">
              {hostOf(data.website)}
            </a>
            . Not {companyName}? Refresh.
          </p>
        ) : null}
        {data.facts.length ? (
          <dl className="space-y-2" data-testid="company-facts">
            {data.facts.map((f) => (
              <div key={f.label}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd>
                  {f.value}
                  <Sources urls={f.sources} />
                </dd>
              </div>
            ))}
          </dl>
        ) : hasProfile ? (
          <p className="text-muted-foreground">No sourced facts were found.</p>
        ) : !busy && data.state !== "failed" ? (
          <p className="text-muted-foreground">
            Not researched yet. Research reads public pages about the company; every fact links to
            its source.
          </p>
        ) : null}
        {data.news.length ? (
          <div>
            <h3 className="text-xs text-muted-foreground">Recent news</h3>
            <ul className="space-y-1">
              {data.news.map((n) => (
                <li key={`${n.date}${n.headline}`}>
                  <span className="text-xs text-muted-foreground tabular-nums">{n.date}</span>{" "}
                  {n.headline}
                  <Sources urls={[n.source]} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.redFlags.length ? (
          <ul className="space-y-1">
            {data.redFlags.map((r) => (
              <li key={r.text} className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {r.text}
                  <Sources urls={[r.source]} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          {hasProfile ? <span>Researched {data.researched}</span> : null}
          {data.state === "failed" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(true)}>
              <RefreshCw aria-hidden /> Retry
            </Button>
          ) : hasProfile ? (
            <Button size="sm" variant="ghost" disabled={pending || busy} onClick={() => run(true)}>
              <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden /> Refresh
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || busy}
              onClick={() => run(false)}
            >
              <Building2 aria-hidden /> Research company
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

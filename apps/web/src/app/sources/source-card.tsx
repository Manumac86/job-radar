"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runSourceNow, setSourceEnabled, setSourceInterval } from "./actions";
import { RiskDialog } from "./risk-dialog";

export interface RunView {
  id: number;
  status: string;
  trigger: string;
  startedAt: string;
  found: number;
  newCount: number;
  filtered: number;
  duplicates: number;
  error: string | null;
  log: string[];
}

export interface SourceView {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  requiresLogin: boolean;
  status: string;
  intervalMinutes: number;
  stoppedUntil: string | null;
  running: boolean;
  runs: RunView[];
}

const STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ok: { label: "OK", variant: "secondary" },
  failing: { label: "Failing", variant: "destructive" },
  stopped: { label: "Stopped for today", variant: "destructive" },
  session_expired: { label: "Session expired", variant: "destructive" },
  logged_out: { label: "Logged out", variant: "outline" },
};

const INTERVALS = [
  [60, "Every hour"],
  [180, "Every 3 hours"],
  [360, "Every 6 hours"],
  [720, "Every 12 hours"],
  [1440, "Daily"],
] as const;

export function SourceCard({ source }: { source: SourceView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [riskOpen, setRiskOpen] = useState(false);
  const last = source.runs[0];
  const status = STATUS[source.status] ?? { label: source.status, variant: "outline" as const };

  // While a run is in progress, refresh until it finishes.
  useEffect(() => {
    if (!source.running) return;
    const t = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(t);
  }, [source.running, router]);

  const toggle = (enabled: boolean) => {
    if (enabled && source.requiresLogin) return setRiskOpen(true);
    start(async () => {
      const r = await setSourceEnabled(source.id, enabled);
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  };

  return (
    <Card data-testid={`source-${source.id}`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            {source.name}
            <Badge variant={status.variant}>{status.label}</Badge>
            {source.requiresLogin ? <Badge variant="outline">Logged-in · read-only</Badge> : null}
            {source.running ? <Badge data-testid="running">Running…</Badge> : null}
          </CardTitle>
          <CardDescription>
            {last
              ? `Last run ${last.startedAt}: ${last.status}, found ${last.found}, new ${last.newCount}, filtered ${last.filtered}`
              : "Never run."}
            {source.stoppedUntil ? ` Paused until ${source.stoppedUntil}.` : ""}
          </CardDescription>
          {last?.error ? (
            <p className="mt-1 text-sm text-destructive" data-testid="last-error">
              {last.error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={source.enabled}
              disabled={pending}
              onCheckedChange={(v) => toggle(v === true)}
              aria-label={`Enable ${source.name}`}
            />
            Enabled
          </Label>
          <Select
            value={String(source.intervalMinutes)}
            onValueChange={(v) =>
              start(async () => {
                const r = await setSourceInterval(source.id, Number(v));
                if (r.ok) toast.success(r.message ?? "Saved");
                else toast.error(r.error);
              })
            }
          >
            <SelectTrigger className="w-40" aria-label={`Interval for ${source.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(INTERVALS.some(([m]) => m === source.intervalMinutes)
                ? INTERVALS
                : [
                    ...INTERVALS,
                    [source.intervalMinutes, `Every ${source.intervalMinutes} min`] as const,
                  ]
              ).map(([m, label]) => (
                <SelectItem key={m} value={String(m)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={pending || source.running}
            onClick={() =>
              start(async () => {
                const r = await runSourceNow(source.id);
                if (r.ok) toast.success(r.message ?? "Run started");
                else toast.error(r.error);
                router.refresh();
              })
            }
          >
            <Play aria-hidden /> Run now
          </Button>
        </div>
      </CardHeader>
      {source.runs.length ? (
        <CardContent>
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Run log ({source.runs.length})
            </summary>
            <ul className="mt-2 space-y-2 text-sm" data-testid="run-log">
              {source.runs.map((r) => (
                <li key={r.id} className="rounded-md border p-2">
                  <div className="tabular-nums">
                    {r.startedAt} · {r.trigger} · {r.status} · found {r.found}, new {r.newCount},
                    filtered {r.filtered}, duplicates {r.duplicates}
                  </div>
                  {r.error ? <div className="text-destructive">{r.error}</div> : null}
                  {r.log.length ? (
                    <pre className="mt-1 max-h-40 overflow-auto text-xs whitespace-pre-wrap text-muted-foreground">
                      {r.log.join("\n")}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      ) : null}
      {source.requiresLogin ? (
        <RiskDialog
          open={riskOpen}
          onOpenChange={setRiskOpen}
          sourceId={source.id}
          sourceName={source.name}
          onConfirm={() =>
            start(async () => {
              const r = await setSourceEnabled(source.id, true, true);
              if (r.ok) toast.success(r.message ?? "Enabled");
              else toast.error(r.error);
              setRiskOpen(false);
            })
          }
        />
      ) : null}
    </Card>
  );
}

import { listRuns, listSources } from "@job-radar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { SourceCard, type SourceView } from "./source-card";

export const metadata: Metadata = { title: "Sources" };

export default function SourcesPage() {
  const d = db();
  // "Added by you" (offers imported from a link) is not a polled source.
  const sources: SourceView[] = listSources(d)
    .filter((s) => s.type !== "manual")
    .map((s) => {
      const runs = listRuns(d, s.id, 10);
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        enabled: s.enabled,
        requiresLogin: s.requiresLogin,
        status: s.status,
        intervalMinutes: s.intervalMinutes,
        stoppedUntil: s.stoppedUntil ? formatDate(s.stoppedUntil, true) : null,
        running: runs[0]?.status === "running",
        runs: runs.map((r) => ({
          id: r.id,
          status: r.status,
          trigger: r.trigger,
          startedAt: formatDate(r.startedAt, true),
          found: r.found,
          newCount: r.newCount,
          filtered: r.filtered,
          duplicates: r.duplicates,
          error: r.error,
          log: r.log,
        })),
      };
    });
  return (
    <>
      <PageHeader
        title="Sources"
        description="Public sources need no account. Logged-in sources are off by default and read-only."
      />
      <div className="grid gap-4" data-testid="sources">
        {sources.map((s) => (
          <SourceCard key={s.id} source={s} />
        ))}
      </div>
    </>
  );
}

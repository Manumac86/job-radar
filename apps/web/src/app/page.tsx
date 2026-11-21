import { appTimeZone } from "@job-radar/core/time";
import { capacityStatus } from "@job-radar/core/pipeline";
import {
  dashboardMetrics,
  responsePatterns,
  FUNNEL_STAGES,
  hasAnyOffers,
  listSources,
  listStages,
  llmUsageByDay,
} from "@job-radar/db";
import { AlertTriangle, Rss } from "lucide-react";
import Link from "next/link";
import { ExampleProfileNotice } from "@/components/example-profile-notice";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ENGAGEMENT_LABELS, formatDate } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readPreferences, usingExampleProfile } from "@/lib/profile";
import { IngestChart } from "./_dashboard/ingest-chart";
import { PeriodSelect } from "./_dashboard/period-select";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div
          className="text-2xl font-semibold tabular-nums"
          data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const period = ([7, 30, 90] as const).find((p) => String(p) === sp["period"]) ?? 30;
  const d = db();
  const example = usingExampleProfile();

  if (!hasAnyOffers(d)) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ExampleProfileNotice show={example} />
        <Card className="mx-auto max-w-xl text-center" data-testid="empty-state">
          <CardHeader>
            <Rss className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <CardTitle>No offers yet</CardTitle>
            <CardDescription>
              Enable a source to start collecting offers. Public sources (ATS job boards, Y
              Combinator, Hacker News, RemoteOK, We Work Remotely) need no account. Job-alert emails
              need your mailbox address and an app password in{" "}
              <code>secrets/imap_app_password</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/sources">Go to Sources</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const m = dashboardMetrics(d, { days: period, now: new Date() });
  // All-time: patterns need more data than one period usually has.
  const allPatterns = responsePatterns(d);
  // "CV sent" only means something once some application recorded which CV went out.
  const patterns = {
    ...allPatterns,
    dimensions: allPatterns.dimensions.filter(
      (dim) => dim.key !== "cv" || dim.rows.some((r) => r.value !== "Unknown"),
    ),
  };
  const sources = listSources(d).map((s) => ({ id: s.id, name: s.name }));
  const sourceName = (id: string) => sources.find((s) => s.id === id)?.name ?? id;
  const stages = listStages(d);
  const stageLabel = (k: string) => stages.find((s) => s.key === k)?.label ?? k;
  const { prefs } = readPreferences();
  const capacity = prefs
    ? capacityStatus(m.committedHours, prefs.engagement.weekly_capacity_hours)
    : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: appTimeZone() }).format(new Date());
  const usage = llmUsageByDay(d, today);
  const used = (k: string) =>
    usage.filter((u) => k.split(",").includes(u.kind)).reduce((s, u) => s + u.calls, 0);
  const caps = prefs?.scoring.daily_caps;
  const funnelStages = FUNNEL_STAGES.filter((s) => s !== "accepted");
  const SHORT: Record<string, string> = {
    applied: "Applied",
    screening_call: "Screen",
    technical_interview: "Tech",
    take_home: "Task",
    fit_interview: "Fit",
    final_interview: "Final",
    offer_received: "Offer",
  };
  const now = Date.parse(today + "T12:00:00Z");
  const periodDays = Array.from({ length: period }, (_, i) =>
    new Date(now - (period - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Last ${period} days.`}
        actions={<PeriodSelect value={period} />}
      />

      <ExampleProfileNotice show={example} />

      {capacity?.over ? (
        <Alert variant="destructive" className="mb-4" data-testid="capacity-warning">
          <AlertTriangle aria-hidden />
          <AlertTitle>Over capacity</AlertTitle>
          <AlertDescription>
            Active engagements commit {capacity.committed} h/week; your capacity is{" "}
            {capacity.capacity} h/week.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Stat label="Offers" value={m.totals.offers} />
        <Stat label="Strong" value={m.totals.strong} hint="score 80+" />
        <Stat label="Possible" value={m.totals.possible} />
        <Stat
          label="Weak"
          value={m.totals.weak}
          hint={m.totals.unscored ? `${m.totals.unscored} not scored` : undefined}
        />
        <Stat label="Shortlisted" value={m.totals.shortlisted} />
        <Stat label="Applied" value={m.totals.applied} />
        <Stat
          label="Committed hours"
          value={capacity ? `${m.committedHours}/${capacity.capacity}` : m.committedHours}
          hint="per week, active engagements"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Offers ingested per day</CardTitle>
            <CardDescription>By source, including filtered offers.</CardDescription>
          </CardHeader>
          <CardContent>
            <IngestChart points={m.ingestedPerDay} sources={sources} days={periodDays} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next 7 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h3 className="mb-1 font-medium">Interviews</h3>
              {m.upcomingInterviews.length ? (
                <ul className="space-y-1" data-testid="upcoming-interviews">
                  {m.upcomingInterviews.map((i) => (
                    <li key={`${i.offerId}-${i.at.toISOString()}`}>
                      <span className="tabular-nums">{formatDate(i.at, true)}</span> ·{" "}
                      <Link href={`/offers/${i.offerId}`} className="hover:underline">
                        {i.company}
                      </Link>{" "}
                      <span className="text-muted-foreground">({i.type.replace(/_/g, " ")})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None scheduled.</p>
              )}
            </div>
            <div>
              <h3 className="mb-1 font-medium">Next steps due</h3>
              {m.dueNextSteps.length ? (
                <ul className="space-y-1">
                  {m.dueNextSteps.map((s) => (
                    <li key={`${s.offerId}-${s.description}`}>
                      {s.description} ·{" "}
                      <Link href={`/offers/${s.offerId}`} className="hover:underline">
                        {s.company}
                      </Link>
                      {s.dueAt ? (
                        <span className="text-muted-foreground"> (due {formatDate(s.dueAt)})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nothing due.</p>
              )}
            </div>
            <div>
              <h3 className="mb-1 font-medium">Active engagements</h3>
              {m.engagements.length ? (
                <ul className="space-y-1">
                  {m.engagements.map((e) => (
                    <li key={`${e.company}-${e.title}`}>
                      {e.company}: {e.weeklyHours} h/week · {e.rateMinor / 100} {e.currency}/
                      {e.ratePeriod}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No active engagements.</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              LLM today: {used("scoring,extraction")}/{caps?.scoring ?? "—"} scoring,{" "}
              {used("drafting")}/{caps?.drafts ?? "—"} drafts, {used("research")}/
              {caps?.research ?? "—"} research
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>
              Applications created in the period that reached each stage, by source.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {m.totals.applied ? (
              <table className="w-full text-sm" data-testid="funnel">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Source</th>
                    {funnelStages.map((s) => (
                      <th
                        key={s}
                        className="px-1 py-1 text-right font-medium"
                        title={stageLabel(s)}
                      >
                        {SHORT[s] ?? stageLabel(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.funnel.map((f) => (
                    <tr key={f.sourceId} className="border-t">
                      <td className="py-1 pr-2">{sourceName(f.sourceId)}</td>
                      {funnelStages.map((s) => (
                        <td key={s} className="px-1 py-1 text-right tabular-nums">
                          {f.reached[s] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    <td className="py-1 pr-2">All</td>
                    {funnelStages.map((s) => (
                      <td key={s} className="px-1 py-1 text-right tabular-nums">
                        {m.funnelAll[s] ?? 0}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No applications in this period.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response rate by source</CardTitle>
            <CardDescription>
              Share of applications with any reply, and median days to the first one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {m.responses.length ? (
              <table className="w-full text-sm" data-testid="responses">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 font-medium">Source</th>
                    <th className="py-1 text-right font-medium">Applied</th>
                    <th className="py-1 text-right font-medium">Responded</th>
                    <th className="py-1 text-right font-medium">Rate</th>
                    <th className="py-1 text-right font-medium">Median days</th>
                  </tr>
                </thead>
                <tbody>
                  {m.responses.map((r) => (
                    <tr key={r.sourceId} className="border-t">
                      <td className="py-1">{sourceName(r.sourceId)}</td>
                      <td className="py-1 text-right tabular-nums">{r.applications}</td>
                      <td className="py-1 text-right tabular-nums">{r.responded}</td>
                      <td className="py-1 text-right tabular-nums">{pct(r.rate)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {r.medianDaysToFirstResponse === null
                          ? "—"
                          : r.medianDaysToFirstResponse.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">No applications in this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6" data-testid="response-patterns">
        <CardHeader>
          <CardTitle>What gets responses</CardTitle>
          <CardDescription>
            All applications so far ({patterns.total}, {patterns.responded} with a reply). Response
            and interview rates by source, engagement, score, how fast you applied and whether you
            sent a Job Radar draft.
            {patterns.total < 15 ? " Below 15 applications these are anecdotes, not patterns." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {patterns.total ? (
            <Tabs defaultValue={patterns.dimensions[0]?.key}>
              <TabsList className="mb-3 flex-wrap">
                {patterns.dimensions.map((dim) => (
                  <TabsTrigger key={dim.key} value={dim.key}>
                    {dim.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {patterns.dimensions.map((dim) => (
                <TabsContent key={dim.key} value={dim.key}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 font-medium">{dim.label}</th>
                        <th className="py-1 text-right font-medium">Applied</th>
                        <th className="py-1 text-right font-medium">Responded</th>
                        <th className="py-1 text-right font-medium">Interviews</th>
                        <th className="py-1 text-right font-medium">Response rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dim.rows.map((r) => (
                        <tr key={r.value} className="border-t">
                          <td className="py-1">
                            {dim.key === "source"
                              ? sourceName(r.value)
                              : dim.key === "engagement"
                                ? (ENGAGEMENT_LABELS[r.value] ?? r.value)
                                : r.value}
                          </td>
                          <td className="py-1 text-right tabular-nums">{r.applications}</td>
                          <td className="py-1 text-right tabular-nums">{r.responded}</td>
                          <td className="py-1 text-right tabular-nums">{r.interviewed}</td>
                          <td className="py-1 text-right tabular-nums">{pct(r.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mark offers as applied and move them on the pipeline board to see patterns here.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import { applications, offers, stageTransitions } from "../schema";
import { activeEngagements, interviewsBetween, nextStepsDueBetween } from "./pipeline";

/** Funnel order: an application "reached" a stage if it moved to it or to any later one. */
export const FUNNEL_STAGES = [
  "applied",
  "screening_call",
  "technical_interview",
  "take_home",
  "fit_interview",
  "final_interview",
  "offer_received",
  "accepted",
] as const;

const DAY = 86_400_000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

export interface DashboardMetrics {
  periodDays: number;
  totals: {
    offers: number;
    strong: number;
    possible: number;
    weak: number;
    unscored: number;
    shortlisted: number;
    applied: number;
  };
  ingestedPerDay: { day: string; sourceId: string; count: number }[];
  funnel: { sourceId: string; total: number; reached: Record<string, number> }[];
  funnelAll: Record<string, number>;
  responses: {
    sourceId: string;
    applications: number;
    responded: number;
    rate: number;
    medianDaysToFirstResponse: number | null;
  }[];
  engagements: {
    company: string;
    title: string;
    weeklyHours: number;
    rateMinor: number;
    currency: string;
    ratePeriod: string;
  }[];
  committedHours: number;
  upcomingInterviews: {
    at: Date;
    timeZone: string;
    type: string;
    company: string;
    offerId: number;
  }[];
  dueNextSteps: { dueAt: Date | null; description: string; company: string; offerId: number }[];
}

/** Dashboard metrics for the last `days` days (job-dashboard spec). */
export function dashboardMetrics(
  db: Db,
  opts: { days: 7 | 30 | 90; now?: Date },
): DashboardMetrics {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - opts.days * DAY);

  const classRows = db
    .select({ cls: offers.scoreClass, n: sql<number>`count(*)` })
    .from(offers)
    .where(gte(offers.firstSeenAt, since))
    .groupBy(offers.scoreClass)
    .all();
  const byClass = (c: string | null) => classRows.find((r) => r.cls === c)?.n ?? 0;
  const shortlisted =
    db
      .select({ n: sql<number>`count(*)` })
      .from(offers)
      .where(and(eq(offers.triage, "shortlisted"), gte(offers.firstSeenAt, since)))
      .get()?.n ?? 0;

  const ingestedPerDay = db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${offers.firstSeenAt} / 1000, 'unixepoch')`,
      sourceId: offers.sourceId,
      count: sql<number>`count(*)`,
    })
    .from(offers)
    .where(gte(offers.firstSeenAt, since))
    .groupBy(sql`1`, offers.sourceId)
    .orderBy(sql`1`)
    .all();

  // Funnel and responses: only applications created in the window, per source.
  const apps = db
    .select({
      id: applications.id,
      sourceId: offers.sourceId,
      appliedAt: applications.appliedAt,
      firstResponseAt: applications.firstResponseAt,
    })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(gte(applications.appliedAt, since))
    .all();
  const transitions = apps.length
    ? db
        .select({
          applicationId: stageTransitions.applicationId,
          toStage: stageTransitions.toStage,
        })
        .from(stageTransitions)
        .where(gte(stageTransitions.at, since))
        .all()
    : [];
  const furthest = new Map<number, number>();
  for (const t of transitions) {
    const idx = FUNNEL_STAGES.indexOf(t.toStage as (typeof FUNNEL_STAGES)[number]);
    if (idx >= 0) furthest.set(t.applicationId, Math.max(furthest.get(t.applicationId) ?? 0, idx));
  }
  const bySource = new Map<string, typeof apps>();
  for (const a of apps) bySource.set(a.sourceId, [...(bySource.get(a.sourceId) ?? []), a]);
  const reachedCounts = (list: typeof apps) =>
    Object.fromEntries(
      FUNNEL_STAGES.map((s, i) => [s, list.filter((a) => (furthest.get(a.id) ?? 0) >= i).length]),
    );
  const funnel = [...bySource.entries()].map(([sourceId, list]) => ({
    sourceId,
    total: list.length,
    reached: reachedCounts(list),
  }));
  const responses = [...bySource.entries()].map(([sourceId, list]) => {
    const responded = list.filter((a) => a.firstResponseAt);
    return {
      sourceId,
      applications: list.length,
      responded: responded.length,
      rate: list.length ? responded.length / list.length : 0,
      medianDaysToFirstResponse: median(
        responded.map((a) => ((a.firstResponseAt as Date).getTime() - a.appliedAt.getTime()) / DAY),
      ),
    };
  });

  const engagements = activeEngagements(db).map((r) => ({
    company: r.offer.companyName,
    title: r.offer.title,
    weeklyHours: r.engagement.weeklyHours,
    rateMinor: r.engagement.rateMinor,
    currency: r.engagement.currency,
    ratePeriod: r.engagement.ratePeriod,
  }));
  const weekAhead = new Date(now.getTime() + 7 * DAY);

  return {
    periodDays: opts.days,
    totals: {
      offers: classRows.reduce((s, r) => s + r.n, 0),
      strong: byClass("strong"),
      possible: byClass("possible"),
      weak: byClass("weak"),
      unscored: byClass(null),
      shortlisted,
      applied: apps.length,
    },
    ingestedPerDay,
    funnel,
    funnelAll: reachedCounts(apps),
    responses,
    engagements,
    committedHours: engagements.reduce((s, e) => s + e.weeklyHours, 0),
    upcomingInterviews: interviewsBetween(db, now, weekAhead).map((r) => ({
      at: r.interview.scheduledAt,
      timeZone: r.interview.timeZone,
      type: r.interview.type,
      company: r.offer.companyName,
      offerId: r.offer.id,
    })),
    dueNextSteps: nextStepsDueBetween(db, new Date(0), weekAhead).map((r) => ({
      dueAt: r.step.dueAt,
      description: r.step.description,
      company: r.offer.companyName,
      offerId: r.offer.id,
    })),
  };
}

export function hasAnyOffers(db: Db): boolean {
  return Boolean(db.select({ id: offers.id }).from(offers).limit(1).get());
}

// ---------- response patterns ----------

export interface PatternRow {
  value: string;
  applications: number;
  responded: number;
  interviewed: number;
  rate: number;
}

export interface ResponsePatterns {
  total: number;
  responded: number;
  dimensions: { key: string; label: string; rows: PatternRow[] }[];
}

/** Stages that mean "got to an interview" (anything past applied except closing ones). */
const INTERVIEW_REACHED = new Set<string>(FUNNEL_STAGES.slice(1));

function scoreBand(score: number | null): string {
  if (score === null) return "Unscored";
  if (score >= 90) return "90+";
  if (score >= 80) return "80–89";
  if (score >= 70) return "70–79";
  return "Below 70";
}

function applySpeed(postedAt: Date | null, appliedAt: Date): string {
  if (!postedAt) return "Posting date unknown";
  const days = (appliedAt.getTime() - postedAt.getTime()) / DAY;
  if (days <= 2) return "Within 2 days";
  if (days <= 7) return "3–7 days";
  return "After a week";
}

/**
 * Which applications get answers (application-pipeline spec, "Response patterns"): response
 * and interview rates by source, engagement type, score band, application speed, draft use
 * and CV sent.
 * Uses every application, or only those created since `since`.
 */
export function responsePatterns(db: Db, opts: { since?: Date } = {}): ResponsePatterns {
  const apps = db
    .select({
      id: applications.id,
      appliedAt: applications.appliedAt,
      firstResponseAt: applications.firstResponseAt,
      sentDraftId: applications.sentDraftId,
      cvVariantName: applications.cvVariantName,
      sourceId: offers.sourceId,
      engagementType: offers.engagementType,
      score: offers.score,
      postedAt: offers.postedAt,
      firstSeenAt: offers.firstSeenAt,
    })
    .from(applications)
    .innerJoin(offers, eq(offers.id, applications.offerId))
    .where(opts.since ? gte(applications.appliedAt, opts.since) : undefined)
    .all();
  const interviewed = new Set(
    db
      .select({ id: stageTransitions.applicationId, to: stageTransitions.toStage })
      .from(stageTransitions)
      .all()
      .filter((t) => INTERVIEW_REACHED.has(t.to))
      .map((t) => t.id),
  );
  const dims: { key: string; label: string; of: (a: (typeof apps)[number]) => string }[] = [
    { key: "source", label: "Source", of: (a) => a.sourceId },
    { key: "engagement", label: "Engagement", of: (a) => a.engagementType },
    { key: "score", label: "Score", of: (a) => scoreBand(a.score) },
    {
      key: "speed",
      label: "Applied after posting",
      of: (a) => applySpeed(a.postedAt ?? a.firstSeenAt, a.appliedAt),
    },
    {
      key: "draft",
      label: "Draft",
      of: (a) => (a.sentDraftId ? "Sent a Job Radar draft" : "Own message"),
    },
    { key: "cv", label: "CV sent", of: (a) => a.cvVariantName ?? "Unknown" },
  ];
  return {
    total: apps.length,
    responded: apps.filter((a) => a.firstResponseAt).length,
    dimensions: dims.map((d) => {
      const groups = new Map<string, typeof apps>();
      for (const a of apps) groups.set(d.of(a), [...(groups.get(d.of(a)) ?? []), a]);
      const rows = [...groups.entries()].map(([value, list]) => {
        const responded = list.filter((a) => a.firstResponseAt).length;
        return {
          value,
          applications: list.length,
          responded,
          interviewed: list.filter((a) => interviewed.has(a.id)).length,
          rate: responded / list.length,
        };
      });
      rows.sort((a, b) => b.rate - a.rate || b.applications - a.applications);
      return { key: d.key, label: d.label, rows };
    }),
  };
}

export interface SkyOffer {
  id: number;
  title: string;
  companyName: string;
  score: number;
  scoreClass: "strong" | "possible" | "weak";
  shortlisted: boolean;
  firstSeenAt: Date;
}

/**
 * Open, scored offers first seen in the period (the dashboard's star field): new or shortlisted,
 * with no application. Newest first, capped so the chart stays legible.
 */
export function skyOffers(db: Db, opts: { days: number; now?: Date; limit?: number }): SkyOffer[] {
  const since = new Date((opts.now ?? new Date()).getTime() - opts.days * 86_400_000);
  const rows = db
    .select({
      id: offers.id,
      title: offers.title,
      companyName: offers.companyName,
      score: offers.score,
      scoreClass: offers.scoreClass,
      triage: offers.triage,
      firstSeenAt: offers.firstSeenAt,
    })
    .from(offers)
    .leftJoin(applications, eq(applications.offerId, offers.id))
    .where(
      and(
        gte(offers.firstSeenAt, since),
        sql`${offers.triage} in ('new', 'shortlisted')`,
        sql`${applications.id} is null`,
        sql`${offers.score} is not null`,
        sql`${offers.scoreClass} is not null`,
      ),
    )
    .orderBy(sql`${offers.firstSeenAt} desc`)
    .limit(opts.limit ?? 400)
    .all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    companyName: r.companyName,
    score: r.score ?? 0,
    scoreClass: r.scoreClass ?? "weak",
    shortlisted: r.triage === "shortlisted",
    firstSeenAt: r.firstSeenAt,
  }));
}

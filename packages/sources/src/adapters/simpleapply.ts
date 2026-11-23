// SimpleApply (simpleapply-source change). Two read-only inputs share one mapper (design D2):
// the owner's "Export CSV" file and, later, the dashboard's own /api/jobs responses. Job Radar
// never applies, marks applied, hides or touches auto-apply on SimpleApply.
import { UNKNOWN_COMPANY, isIdLikeCompany, type NormalizedOfferInput } from "@job-radar/core";
import { appTimeZone, zonedTimeToUtc } from "@job-radar/core/time";
import { csvRecords } from "../csv";
import { PageCapReachedError } from "../browser/guard";
import { SessionExpiredError, isLoginWall, type SiteDefinition } from "../browser/sessions";
import type { SourceAdapter } from "../types";
import { inferEngagement, inferRemotePolicy, regionsFrom } from "../util";

export const SIMPLEAPPLY_SOURCE_ID = "simpleapply";
export const SIMPLEAPPLY_CSV_MAX_BYTES = 5 * 1024 * 1024;
export const SIMPLEAPPLY_CSV_MAX_ROWS = 2000;
export const SIMPLEAPPLY_REQUIRED_COLUMNS = ["Job Title", "Company", "Job URL"] as const;

/** One SimpleApply match, whatever its input. */
export interface SimpleApplyMatch {
  title: string;
  company: string;
  url: string;
  location?: string | null;
  workplaceType?: string | null;
  summary?: string | null;
  /** `YYYY-MM-DD` or an ISO timestamp. */
  postedAt?: string | null;
  appliedAt?: string | null;
  status?: string | null;
  /** 0–100. */
  matchPercent?: number | null;
  /** Major units (e.g. 142800 for $142,800). */
  salary?: {
    min: number | null;
    max: number | null;
    currency: string | null;
    period: "year" | "hour" | "month" | null;
  } | null;
  employmentType?: string | null;
  skills?: string[] | null;
  via: "simpleapply csv" | "simpleapply dashboard";
  raw?: unknown;
}

export interface MappedMatch {
  offer: NormalizedOfferInput;
  /** Set when SimpleApply reports the job as applied (design D4). */
  appliedAt: Date | null;
}

export class SimpleApplyCsvError extends Error {
  override readonly name = "SimpleApplyCsvError";
}

/** Query parameters that identify a posting; everything else is tracking. */
const ID_PARAMS = /^(gh_jid|jobid|job_id|id|jid|lever-source-id)$/i;

/** `simpleapply:<host><path>[?id params]`, stable across tracking parameters (design D1). */
export function simpleApplyExternalId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  const keep = [...u.searchParams.entries()]
    .filter(([k]) => ID_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `simpleapply:${host}${path}${keep.length ? `?${keep.join("&")}` : ""}`;
}

/** A date-only value is read as noon in the app time zone; timestamps as given. */
export function simpleApplyDate(
  value: string | null | undefined,
  timeZone = appTimeZone(),
): Date | null {
  const v = value?.trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, timeZone);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const APPLIED_STATUS = /^(applied|interview|interviewing)$/i;

export function mapSimpleApplyMatch(
  m: SimpleApplyMatch,
  now: Date,
  timeZone = appTimeZone(),
): MappedMatch | null {
  const title = m.title.trim();
  const given = m.company.trim();
  // Dover jobs come with the client id as their company (simpleapply-dover-fixes D2).
  const company = isIdLikeCompany(given) ? UNKNOWN_COMPANY : given;
  const externalId = simpleApplyExternalId(m.url.trim());
  if (!title || !company || !externalId) return null;
  const workplace = m.workplaceType?.trim() ?? "";
  const remotePolicy = /^remote$/i.test(workplace)
    ? "remote"
    : inferRemotePolicy(workplace, m.location ?? null);
  const salary = m.salary;
  const compensation =
    salary && (salary.min !== null || salary.max !== null)
      ? {
          min: salary.min === null ? null : Math.round(salary.min * 100),
          max: salary.max === null ? null : Math.round(salary.max * 100),
          currency: salary.currency && /^[A-Z]{3}$/.test(salary.currency) ? salary.currency : null,
          period: salary.period,
        }
      : null;
  const applied =
    simpleApplyDate(m.appliedAt, timeZone) ??
    (m.status && APPLIED_STATUS.test(m.status.trim()) ? now : null);
  return {
    appliedAt: applied,
    offer: {
      sourceId: SIMPLEAPPLY_SOURCE_ID,
      externalId,
      sourceUrl: m.url.trim(),
      title,
      companyName: company,
      location: m.location?.trim() || null,
      remotePolicy,
      regions: regionsFrom(m.location),
      compensation,
      engagementType: inferEngagement(m.employmentType?.replace(/_/g, " ")),
      skills: (m.skills ?? []).filter((x) => typeof x === "string").slice(0, 50),
      postedAt: simpleApplyDate(m.postedAt, timeZone),
      description: m.summary?.trim() ?? "",
      applyMethod: "Apply on the company site (open manually)",
      applyUrl: m.url.trim(),
      companyMeta: { via: m.via },
      raw: {
        ...(m.raw && typeof m.raw === "object" ? (m.raw as Record<string, unknown>) : {}),
        simpleapplyMatch: m.matchPercent ?? null,
        simpleapplyAppliedAt: applied?.toISOString() ?? null,
        via: m.via,
      },
    },
  };
}

function percent(v: string | undefined): number | null {
  const n = Number.parseFloat((v ?? "").replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

export interface ParsedSimpleApplyCsv {
  matches: MappedMatch[];
  invalid: number;
}

/** Parses an "Export CSV" file (design D3). Throws SimpleApplyCsvError for a non-SimpleApply file. */
export function parseSimpleApplyCsv(
  text: string,
  now = new Date(),
  timeZone = appTimeZone(),
): ParsedSimpleApplyCsv {
  if (Buffer.byteLength(text, "utf8") > SIMPLEAPPLY_CSV_MAX_BYTES)
    throw new SimpleApplyCsvError("The file is larger than 5 MB");
  const { header, records } = csvRecords(text);
  const missing = SIMPLEAPPLY_REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length)
    throw new SimpleApplyCsvError(
      `This is not a SimpleApply export: missing column${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
    );
  if (records.length > SIMPLEAPPLY_CSV_MAX_ROWS)
    throw new SimpleApplyCsvError(`The file has more than ${SIMPLEAPPLY_CSV_MAX_ROWS} rows`);
  const matches: MappedMatch[] = [];
  let invalid = 0;
  for (const r of records) {
    const mapped = mapSimpleApplyMatch(
      {
        title: r["Job Title"] ?? "",
        company: r["Company"] ?? "",
        url: r["Job URL"] ?? "",
        location: r["Location"] ?? null,
        workplaceType: r["Workplace Type"] ?? null,
        summary: r["Requirements Summary"] ?? null,
        postedAt: r["Date Posted"] ?? null,
        appliedAt: r["Date Applied"] ?? null,
        status: r["Status"] ?? null,
        matchPercent: percent(r["Match Percentage"]),
        via: "simpleapply csv",
        raw: r,
      },
      now,
      timeZone,
    );
    if (mapped) matches.push(mapped);
    else invalid++;
  }
  return { matches, invalid };
}

/** Isolated-profile site definition (browser-sessions spec). The app is a single-page app. */
export const SIMPLEAPPLY_SITE: SiteDefinition = {
  id: SIMPLEAPPLY_SOURCE_ID,
  label: "SimpleApply (logged-in)",
  loginUrl: "https://simpleapply.ai/auth",
  checkUrl: "https://simpleapply.ai/dashboard",
  loginUrlPattern: /\/(login|sign-?in|signup|sign-?up|auth)\b/i,
};

export const SIMPLEAPPLY_DASHBOARD = "https://simpleapply.ai/dashboard";
/** The dashboard's own job-list endpoint (design D5); never called by Job Radar. */
export const SIMPLEAPPLY_JOBS_PATH = /^\/api\/jobs$/;

/** Rebuilds the applied date carried in `raw` (runs of the logged-in source, design D4). */
export function appliedAtOf(offer: NormalizedOfferInput): Date | null {
  const raw = offer.raw as { simpleapplyAppliedAt?: unknown } | null | undefined;
  const v = raw?.simpleapplyAppliedAt;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One item of the dashboard's `/api/jobs` list (captured 2026-11-18; only the fields we read). */
interface DashboardJob {
  id?: number;
  job_id?: number;
  job_title?: string | null;
  core_job_title?: string | null;
  company_name?: string | null;
  job_url?: string | null;
  formatted_location?: string | null;
  location_countries?: string[] | null;
  workplace_type?: string | null;
  employment_type?: string | null;
  experience_level?: string | null;
  date_posted?: string | null;
  match_percentage?: number | null;
  min_annual_salary?: number | null;
  max_annual_salary?: number | null;
  salary_currency?: string | null;
  skills?: string[] | null;
  description?: string | null;
  applied?: boolean;
  applied_last_at?: string | null;
  applied_manual_at?: string | null;
  success_at?: string | null;
  user_hidden?: boolean;
  expired?: boolean;
  provider?: string | null;
  source?: string | null;
}

/** The list does not carry the posting text: a short summary from what it does carry. */
function dashboardSummary(j: DashboardJob): string {
  const lines = [
    j.description?.trim() || "SimpleApply match (the full description is on the company site).",
    j.experience_level ? `Experience level: ${j.experience_level}` : "",
    j.employment_type ? `Employment: ${j.employment_type.replace(/_/g, " ")}` : "",
    j.skills?.length ? `Skills: ${j.skills.slice(0, 50).join(", ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Matches from the `/api/jobs` bodies the dashboard loaded (design D2/D5). Count-only calls, hidden
 * and expired jobs are ignored; a job seen in several lists is kept once.
 */
export function matchesFromDashboard(
  responses: { url: string; status: number; body: unknown }[],
  now: Date,
  timeZone = appTimeZone(),
): MappedMatch[] {
  const seen = new Set<string>();
  const out: MappedMatch[] = [];
  for (const r of responses) {
    if (r.status !== 200 || /[?&]count_only=true\b/.test(r.url)) continue;
    const jobs = (r.body as { jobs?: unknown } | null)?.jobs;
    if (!Array.isArray(jobs)) continue;
    for (const item of jobs as DashboardJob[]) {
      if (!item || typeof item !== "object" || item.user_hidden || item.expired) continue;
      const salary =
        item.min_annual_salary || item.max_annual_salary
          ? {
              min: item.min_annual_salary ?? null,
              max: item.max_annual_salary ?? null,
              currency: item.salary_currency ?? null,
              period: "year" as const,
            }
          : null;
      const mapped = mapSimpleApplyMatch(
        {
          title: item.job_title ?? item.core_job_title ?? "",
          company: item.company_name ?? "",
          url: item.job_url ?? "",
          location: item.formatted_location ?? item.location_countries?.join(", ") ?? null,
          workplaceType: item.workplace_type ?? null,
          employmentType: item.employment_type ?? null,
          skills: item.skills ?? null,
          summary: dashboardSummary(item),
          postedAt: item.date_posted ?? null,
          appliedAt: item.applied
            ? (item.applied_last_at ?? item.applied_manual_at ?? item.success_at ?? null)
            : null,
          matchPercent: item.match_percentage ?? null,
          salary,
          via: "simpleapply dashboard",
          // Only job facts: never the account's ids or SimpleApply's internal state.
          raw: {
            simpleapplyJobId: item.job_id ?? null,
            provider: item.provider ?? null,
            experienceLevel: item.experience_level ?? null,
          },
        },
        now,
        timeZone,
      );
      if (!mapped || seen.has(mapped.offer.externalId)) continue;
      seen.add(mapped.offer.externalId);
      out.push(mapped);
    }
  }
  return out;
}

export class SimpleApplyNoDataError extends Error {
  override readonly name = "SimpleApplyNoDataError";
  constructor() {
    super("The SimpleApply dashboard loaded but no job list arrived; the site may have changed");
  }
}

const NEXT_PAGE = 'button[aria-label="Next page"]:not([disabled])';
const MAX_PAGES = 5;
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * "SimpleApply (logged-in)" (design D5): opens the dashboard, reads the job lists the page
 * itself loads, and pages through with "Next page". It never clicks anything else.
 */
export const simpleApplyAdapter: SourceAdapter = {
  type: SIMPLEAPPLY_SOURCE_ID,
  label: SIMPLEAPPLY_SITE.label,
  defaultIntervalMinutes: 720,
  requiresLogin: true,
  async fetchOffers(ctx) {
    if (!ctx.browser) throw new Error("The isolated browser is not available in this worker");
    const wait = (ctx.settings["settleMs"] as number | undefined) ?? 6000;
    const matches = await ctx.browser.withSite(
      SIMPLEAPPLY_SITE,
      async (page) => {
        await page.goto(SIMPLEAPPLY_DASHBOARD);
        await settle(wait);
        const out: MappedMatch[] = [];
        let gotList = false;
        for (let n = 1; n <= MAX_PAGES; n++) {
          const responses = await page.jsonResponses(SIMPLEAPPLY_JOBS_PATH);
          if (
            responses.some((r) => r.status === 401) ||
            isLoginWall(SIMPLEAPPLY_SITE, page.url(), "")
          )
            throw new SessionExpiredError(SIMPLEAPPLY_SOURCE_ID);
          const lists = responses.filter((r) => r.status === 200 && !/count_only=true/.test(r.url));
          if (lists.length) gotList = true;
          out.push(...matchesFromDashboard(lists, ctx.now()));
          if (n === MAX_PAGES || !(await page.waitFor(NEXT_PAGE, 2000))) break;
          try {
            await page.safeClick(NEXT_PAGE);
          } catch (err) {
            if (err instanceof PageCapReachedError) {
              ctx.log(err.message);
              break;
            }
            throw err;
          }
          await settle(wait);
        }
        if (!gotList) throw new SimpleApplyNoDataError();
        return out;
      },
      ctx.log,
    );
    const unique = new Map(matches.map((m) => [m.offer.externalId, m.offer]));
    ctx.log(`dashboard: ${unique.size} matches`);
    return [...unique.values()];
  },
};

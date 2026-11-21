// MyGreenhouse (mygreenhouse-source change): Greenhouse's candidate portal, read with the
// owner's session from the isolated browser profile. Read-only: it never applies, quick-applies,
// marks a dream job, saves or withdraws. The owner signs in by hand with the code Greenhouse
// emails; Job Radar never sees it.
//
// Every list arrives as the page's own same-origin JSON (design D1, captured 2026-11-21): the
// search (Inertia `jobs` page), `/recommendations` and `/applications.json`.
import type { NormalizedOfferInput } from "@job-radar/core";
import { PageCapReachedError } from "../browser/guard";
import type { CapturedResponse, ReadOnlyPage } from "../browser/guard";
import { SessionExpiredError, isLoginWall, type SiteDefinition } from "../browser/sessions";
import type { SourceAdapter, SourceContext } from "../types";
import { inferRemotePolicy, regionsFrom, searchTerms, toDate } from "../util";

export const MYGREENHOUSE_SOURCE_ID = "mygreenhouse";
const ORIGIN = "https://my.greenhouse.io";

export const MYGREENHOUSE_SITE: SiteDefinition = {
  id: MYGREENHOUSE_SOURCE_ID,
  label: "MyGreenhouse (logged-in)",
  loginUrl: `${ORIGIN}/`,
  checkUrl: `${ORIGIN}/dashboard`,
  loginUrlPattern: /\/(users\/)?(sign[-_]?in|log[-_]?in|auth|verify|otp)\b/i,
};

export const MYGREENHOUSE_MAX_KEYWORDS = 5;
export const MYGREENHOUSE_SEARCH_PAGES = 2;

/** Matched against the path only, as `ReadOnlyPage.jsonResponses` does (no query string). */
export const MYGREENHOUSE_PATHS = {
  search: /^\/jobs\/search$/,
  recommendations: /^\/recommendations$/,
  applications: /^\/applications\.json$/,
};

const pathOf = (url: string) => url.split("?")[0] ?? url;

export type MyGreenhouseVia = "MyGreenhouse search" | "MyGreenhouse recommended";

/** One application as MyGreenhouse lists it, reduced to what Job Radar keeps (design D4). */
export interface MyGreenhouseApplication {
  /** Greenhouse's application id. */
  portalId: string;
  /** `<board>:<jobId>`, the Greenhouse board adapter's id (design D3), when the link has one. */
  jobKey: string | null;
  company: string;
  title: string;
  url: string;
  location: string | null;
  appliedAt: Date | null;
  /** `applied`, `inactive`, or the name of the last shared stage (design D4). */
  status: string;
}

/** `{ board, id }` from a public board link (`job-boards[.eu].greenhouse.io/<board>/jobs/<id>`). */
export function greenhouseBoardJob(url: string | null | undefined): {
  board: string;
  id: string;
} | null {
  const m =
    /^https?:\/\/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/i.exec(
      url ?? "",
    );
  const [, board, id] = m ?? [];
  return board && id ? { board: board.toLowerCase(), id } : null;
}

/** D3 id: `<board>:<jobId>`, else `mygreenhouse:<jobId>`. */
export function myGreenhouseExternalId(
  url: string | null | undefined,
  jobId: number | string | null | undefined,
): string | null {
  const bj = greenhouseBoardJob(url);
  if (bj) return `${bj.board}:${bj.id}`;
  return jobId !== null && jobId !== undefined && String(jobId).trim()
    ? `mygreenhouse:${String(jobId).trim()}`
    : null;
}

/** A search or recommendation item (only the fields we read). */
interface JobPost {
  id?: number;
  title?: string | null;
  companyName?: string | null;
  publicUrl?: string | null;
  urlToken?: string | null;
  locations?: string[] | null;
  workType?: string | null;
  firstPublished?: string | null;
  description?: string | null;
  rank?: number | null;
}

const WORK_TYPE: Record<string, NormalizedOfferInput["remotePolicy"]> = {
  remote: "remote",
  hybrid: "hybrid",
  in_person: "onsite",
  on_site: "onsite",
};

export function mapJobPost(post: JobPost, via: MyGreenhouseVia): NormalizedOfferInput | null {
  const title = post.title?.trim() ?? "";
  const company = post.companyName?.trim() ?? "";
  const url = post.publicUrl?.trim() ?? "";
  const externalId = myGreenhouseExternalId(url, post.id);
  if (!title || !company || !url || !externalId) return null;
  const locations = (post.locations ?? []).filter((l) => typeof l === "string" && l.trim());
  const location = locations.join(" · ") || null;
  const remotePolicy =
    WORK_TYPE[post.workType ?? ""] ?? inferRemotePolicy(post.workType ?? null, location);
  const description =
    post.description?.trim() ||
    [
      `${title} at ${company} (found on MyGreenhouse; the full description is on the job board).`,
      location ? `Locations: ${location}` : "",
      post.workType ? `Work type: ${post.workType.replace(/_/g, " ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  return {
    sourceId: MYGREENHOUSE_SOURCE_ID,
    externalId,
    sourceUrl: url,
    title,
    companyName: company,
    location,
    remotePolicy,
    regions: regionsFrom(...locations),
    postedAt: toDate(post.firstPublished ?? null),
    description,
    applyMethod: "Apply on the job board (open manually)",
    applyUrl: url,
    companyMeta: { via },
    raw: {
      via,
      // Greenhouse's own ranking is kept as metadata only, never as Job Radar's score (D3).
      greenhouseRank: typeof post.rank === "number" ? post.rank : null,
    },
  };
}

function propsOf(body: unknown): { jobPosts?: unknown; moreResultsAvailable?: unknown } | null {
  const b = body as { component?: unknown; props?: unknown } | null;
  return b && typeof b === "object" && b.props && typeof b.props === "object"
    ? (b.props as { jobPosts?: unknown; moreResultsAvailable?: unknown })
    : null;
}

export interface SearchPage {
  offers: NormalizedOfferInput[];
  /** True when a job list arrived (even an empty one). */
  gotList: boolean;
  more: boolean;
}

/** Jobs from the search page's Inertia responses. */
export function offersFromSearch(responses: CapturedResponse[]): SearchPage {
  const out: SearchPage = { offers: [], gotList: false, more: false };
  for (const r of responses) {
    if (r.status !== 200 || !MYGREENHOUSE_PATHS.search.test(pathOf(r.url))) continue;
    const props = propsOf(r.body);
    if (!props || !Array.isArray(props.jobPosts)) continue;
    out.gotList = true;
    out.more ||= props.moreResultsAvailable === true;
    for (const p of props.jobPosts as JobPost[]) {
      const o = p && typeof p === "object" ? mapJobPost(p, "MyGreenhouse search") : null;
      if (o) out.offers.push(o);
    }
  }
  return out;
}

/** Recommended jobs from the dashboard's `/recommendations` response. */
export function offersFromRecommendations(responses: CapturedResponse[]): SearchPage {
  const out: SearchPage = { offers: [], gotList: false, more: false };
  for (const r of responses) {
    if (r.status !== 200 || !MYGREENHOUSE_PATHS.recommendations.test(pathOf(r.url))) continue;
    const list = (r.body as { recommendations?: unknown } | null)?.recommendations;
    if (!Array.isArray(list)) continue;
    out.gotList = true;
    for (const p of list as JobPost[]) {
      const o = p && typeof p === "object" ? mapJobPost(p, "MyGreenhouse recommended") : null;
      if (o) out.offers.push(o);
    }
  }
  return out;
}

interface RawApplication {
  id?: number;
  company_name?: string | null;
  job_title?: string | null;
  job_post_url?: string | null;
  job_post_id?: number | null;
  locations?: string | null;
  applied_at?: string | null;
  inactive?: boolean;
  stages?: unknown[] | null;
}

/** The name of a shared stage: a string, or an object with `name`, `title` or `status`. */
function stageName(stage: unknown): string | null {
  if (typeof stage === "string") return stage.trim() || null;
  if (stage && typeof stage === "object") {
    const s = stage as Record<string, unknown>;
    for (const k of ["name", "title", "status"]) {
      const v = s[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

/** Design D4: `inactive`, else the last shared stage, else `applied`. */
export function portalStatusOf(a: { inactive?: boolean; stages?: unknown[] | null }): string {
  if (a.inactive) return "inactive";
  const names = (a.stages ?? []).map(stageName).filter((s): s is string => Boolean(s));
  return names.at(-1) ?? "applied";
}

export function mapApplication(a: RawApplication): MyGreenhouseApplication | null {
  if (typeof a.id !== "number" && typeof a.id !== "string") return null;
  const company = a.company_name?.trim() ?? "";
  const title = a.job_title?.trim() ?? "";
  const url = a.job_post_url?.trim() ?? "";
  if (!company || !title) return null;
  const bj = greenhouseBoardJob(url);
  return {
    portalId: String(a.id),
    jobKey: bj ? `${bj.board}:${bj.id}` : null,
    company,
    title,
    url,
    location: a.locations?.trim() || null,
    appliedAt: toDate(a.applied_at ?? null),
    status: portalStatusOf(a),
  };
}

export interface ApplicationsRead {
  applications: MyGreenhouseApplication[];
  gotList: boolean;
  /** True when the active or inactive list has pages beyond the first. */
  more: boolean;
}

/** The owner's applications from `/applications.json` responses (active and inactive lists). */
export function applicationsFromResponses(responses: CapturedResponse[]): ApplicationsRead {
  const out: ApplicationsRead = { applications: [], gotList: false, more: false };
  const seen = new Set<string>();
  for (const r of responses) {
    if (r.status !== 200 || !MYGREENHOUSE_PATHS.applications.test(pathOf(r.url))) continue;
    const body = r.body as Record<string, unknown> | null;
    for (const key of ["active", "inactive"]) {
      const group = body?.[key] as
        { applications?: unknown; total_pages?: unknown } | null | undefined;
      if (!group || !Array.isArray(group.applications)) continue;
      out.gotList = true;
      if (typeof group.total_pages === "number" && group.total_pages > 1) out.more = true;
      for (const raw of group.applications as RawApplication[]) {
        const a = raw && typeof raw === "object" ? mapApplication(raw) : null;
        if (!a || seen.has(a.portalId)) continue;
        seen.add(a.portalId);
        out.applications.push(a);
      }
    }
  }
  return out;
}

/** The offer for an application (imported when the job is unknown, design D4). */
export function applicationOffer(a: MyGreenhouseApplication): NormalizedOfferInput | null {
  if (!a.jobKey || !a.url) return null;
  return {
    sourceId: MYGREENHOUSE_SOURCE_ID,
    externalId: a.jobKey,
    sourceUrl: a.url,
    title: a.title,
    companyName: a.company,
    location: a.location,
    remotePolicy: inferRemotePolicy(a.location),
    regions: regionsFrom(a.location),
    description: `${a.title} at ${a.company}: you applied through Greenhouse (the full description is on the job board).`,
    applyMethod: "Applied through Greenhouse",
    applyUrl: a.url,
    companyMeta: { via: "MyGreenhouse applications" },
    raw: { via: "MyGreenhouse applications" },
  };
}

export class MyGreenhouseNoDataError extends Error {
  override readonly name = "MyGreenhouseNoDataError";
  constructor(what: string) {
    super(`MyGreenhouse loaded but no ${what} arrived; the site may have changed`);
  }
}

/** What one run read: offers for ingestion and the application statuses (design D2). */
export interface MyGreenhouseRead {
  offers: NormalizedOfferInput[];
  applications: MyGreenhouseApplication[];
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(
  page: ReadOnlyPage,
  url: string,
  path: RegExp,
  wait: number,
): Promise<CapturedResponse[] | null> {
  await page.goto(url);
  await settle(wait);
  const responses = await page.jsonResponses(path);
  if (responses.some((r) => r.status === 401) || isLoginWall(MYGREENHOUSE_SITE, page.url(), ""))
    throw new SessionExpiredError(MYGREENHOUSE_SOURCE_ID);
  return responses;
}

/**
 * One run (design D2): the search per keyword (pages by URL), the dashboard's recommendations
 * and the applications list. Opens pages only; never clicks. Stops early at the page cap.
 */
export async function readMyGreenhouse(ctx: SourceContext): Promise<MyGreenhouseRead> {
  if (!ctx.browser) throw new Error("The isolated browser is not available in this worker");
  const wait = (ctx.settings["settleMs"] as number | undefined) ?? 5000;
  const terms = searchTerms(ctx).slice(0, MYGREENHOUSE_MAX_KEYWORDS);
  return ctx.browser.withSite(
    MYGREENHOUSE_SITE,
    async (page) => {
      const offers: NormalizedOfferInput[] = [];
      let applications: MyGreenhouseApplication[] = [];
      try {
        // Applications first: statuses matter more than one more page of search results.
        const apps = applicationsFromResponses(
          (await open(page, `${ORIGIN}/applications`, MYGREENHOUSE_PATHS.applications, wait)) ?? [],
        );
        if (!apps.gotList) throw new MyGreenhouseNoDataError("applications list");
        applications = apps.applications;
        ctx.log(`applications: ${applications.length}`);
        if (apps.more) ctx.log("applications: more pages exist; only the first page is read");
        for (const a of applications) {
          const o = applicationOffer(a);
          if (o) offers.push(o);
        }

        const rec = offersFromRecommendations(
          (await open(page, `${ORIGIN}/dashboard`, MYGREENHOUSE_PATHS.recommendations, wait)) ?? [],
        );
        if (!rec.gotList) ctx.log("recommendations: none arrived");
        else ctx.log(`recommendations: ${rec.offers.length}`);
        offers.push(...rec.offers);

        for (const term of terms) {
          for (let n = 1; n <= MYGREENHOUSE_SEARCH_PAGES; n++) {
            const url = `${ORIGIN}/jobs/search?query=${encodeURIComponent(term)}${n > 1 ? `&page=${n}` : ""}`;
            const res = offersFromSearch(
              (await open(page, url, MYGREENHOUSE_PATHS.search, wait)) ?? [],
            );
            if (!res.gotList) throw new MyGreenhouseNoDataError("job list");
            ctx.log(`search "${term}" page ${n}: ${res.offers.length}`);
            offers.push(...res.offers);
            if (!res.more) break;
          }
        }
      } catch (err) {
        if (!(err instanceof PageCapReachedError)) throw err;
        ctx.log(`${err.message}; the rest is read next run`);
      }
      const unique = new Map<string, NormalizedOfferInput>();
      // The first sighting wins: an applied job keeps its "applications" origin.
      for (const o of offers) if (!unique.has(o.externalId)) unique.set(o.externalId, o);
      return { offers: [...unique.values()], applications };
    },
    ctx.log,
  );
}

export const myGreenhouseAdapter: SourceAdapter = {
  type: MYGREENHOUSE_SOURCE_ID,
  label: MYGREENHOUSE_SITE.label,
  defaultIntervalMinutes: 12 * 60,
  requiresLogin: true,
  async fetchOffers(ctx) {
    const read = await readMyGreenhouse(ctx);
    ctx.reportApplications?.(read.applications);
    return read.offers;
  },
};

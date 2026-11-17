// Public ATS job boards (design D5): Greenhouse, Lever and Ashby, for companies in companies.yaml.
import type { NormalizedOfferInput } from "@job-radar/core";
import { loadCompanies, type CompanyEntry } from "../companies";
import type { SourceAdapter, SourceContext } from "../types";
import { htmlToText, inferEngagement, inferRemotePolicy, regionsFrom, toDate } from "../util";

// ---------- Greenhouse ----------
interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  location?: { name?: string };
  content?: string;
  metadata?: { name: string; value: unknown }[] | null;
  offices?: { name?: string; location?: string | null }[];
}

export function normalizeGreenhouse(
  company: CompanyEntry,
  job: GreenhouseJob,
  sourceId = "greenhouse",
): NormalizedOfferInput {
  const location = job.location?.name ?? null;
  const meta = Object.fromEntries((job.metadata ?? []).map((m) => [m.name, m.value]));
  const description = htmlToText(job.content);
  return {
    sourceId,
    externalId: `${company.slug}:${job.id}`,
    sourceUrl: job.absolute_url,
    title: job.title.trim(),
    companyName: job.company_name ?? company.name,
    companyWebsite: company.website ?? null,
    location,
    remotePolicy: inferRemotePolicy(
      location,
      String(meta["Workplace Type"] ?? ""),
      description.slice(0, 600),
    ),
    regions: regionsFrom(location, ...(job.offices ?? []).map((o) => o.name)),
    engagementType: inferEngagement(String(meta["Employment Type"] ?? ""), job.title),
    postedAt: toDate(job.first_published ?? job.updated_at),
    description,
    applyMethod: "ats",
    applyUrl: job.absolute_url,
    companyMeta: { ats: "greenhouse", board: company.slug },
    raw: { ...job, content: undefined },
  };
}

// ---------- Lever ----------
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  country?: string;
  categories?: { commitment?: string; location?: string; allLocations?: string[]; team?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

const LEVER_INTERVAL: Record<string, "hour" | "day" | "week" | "month" | "year"> = {
  "per-hour-wage": "hour",
  "per-day-wage": "day",
  "per-week-salary": "week",
  "per-month-salary": "month",
  "per-year-salary": "year",
};

export function normalizeLever(
  company: CompanyEntry,
  p: LeverPosting,
  sourceId = "lever",
): NormalizedOfferInput {
  const locs = p.categories?.allLocations?.length
    ? p.categories.allLocations
    : [p.categories?.location];
  const description = [
    p.descriptionPlain ?? "",
    ...(p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
    p.additionalPlain ?? "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const s = p.salaryRange;
  return {
    sourceId,
    externalId: `${company.slug}:${p.id}`,
    sourceUrl: p.hostedUrl,
    title: p.text.trim(),
    companyName: company.name,
    companyWebsite: company.website ?? null,
    location: locs.filter(Boolean).join(" / ") || null,
    remotePolicy: inferRemotePolicy(p.workplaceType, ...locs),
    regions: regionsFrom(...locs, p.country),
    engagementType: inferEngagement(p.categories?.commitment, p.text),
    compensation:
      s && (s.min || s.max) && s.currency
        ? {
            min: s.min ? Math.round(s.min * 100) : null,
            max: s.max ? Math.round(s.max * 100) : null,
            currency: s.currency.toUpperCase(),
            period: s.interval ? (LEVER_INTERVAL[s.interval] ?? null) : null,
          }
        : null,
    postedAt: toDate(p.createdAt),
    description,
    applyMethod: "ats",
    applyUrl: p.applyUrl ?? p.hostedUrl,
    companyMeta: { ats: "lever", board: company.slug, team: p.categories?.team },
    raw: { ...p, description: undefined, descriptionPlain: undefined, lists: undefined },
  };
}

// ---------- Ashby ----------
interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  applyUrl?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  isListed?: boolean;
  compensation?: {
    summaryComponents?: {
      compensationType: string;
      interval: string;
      currencyCode: string | null;
      minValue: number | null;
      maxValue: number | null;
    }[];
  };
}

const ASHBY_INTERVAL: Record<string, "hour" | "day" | "week" | "month" | "year"> = {
  "1 HOUR": "hour",
  "1 DAY": "day",
  "1 WEEK": "week",
  "1 MONTH": "month",
  "1 YEAR": "year",
};

export function normalizeAshby(
  company: CompanyEntry,
  j: AshbyJob,
  sourceId = "ashby",
): NormalizedOfferInput {
  const locs = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)];
  const comps = j.compensation?.summaryComponents ?? [];
  const salary = comps.find((c) => c.compensationType === "Salary" && c.currencyCode);
  const equity = comps.find(
    (c) => c.compensationType === "EquityPercentage" && (c.minValue || c.maxValue),
  );
  return {
    sourceId,
    externalId: `${company.slug}:${j.id}`,
    sourceUrl: j.jobUrl,
    title: j.title.trim(),
    companyName: company.name,
    companyWebsite: company.website ?? null,
    location: locs.filter(Boolean).join(" / ") || null,
    remotePolicy: inferRemotePolicy(j.workplaceType, j.isRemote ?? false, ...locs),
    regions: regionsFrom(...locs),
    engagementType: inferEngagement(j.employmentType, j.title),
    compensation: salary
      ? {
          min: salary.minValue !== null ? Math.round(salary.minValue * 100) : null,
          max: salary.maxValue !== null ? Math.round(salary.maxValue * 100) : null,
          currency: salary.currencyCode,
          period: ASHBY_INTERVAL[salary.interval] ?? null,
        }
      : null,
    equityMin: equity?.minValue ?? null,
    equityMax: equity?.maxValue ?? null,
    postedAt: toDate(j.publishedAt),
    description: j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml),
    applyMethod: "ats",
    applyUrl: j.applyUrl ?? j.jobUrl,
    companyMeta: { ats: "ashby", board: company.slug },
    raw: { ...j, descriptionHtml: undefined, descriptionPlain: undefined },
  };
}

// ---------- adapters ----------

async function eachCompany(
  ctx: SourceContext,
  ats: CompanyEntry["ats"],
  fetchOne: (c: CompanyEntry) => Promise<NormalizedOfferInput[]>,
): Promise<NormalizedOfferInput[]> {
  const companies = loadCompanies(ctx.dataDir).filter((c) => c.ats === ats);
  if (!companies.length) ctx.log(`No ${ats} companies in data/profile/companies.yaml`);
  const out: NormalizedOfferInput[] = [];
  let failures = 0;
  for (const company of companies) {
    if (ctx.signal?.aborted) break;
    try {
      const offers = await fetchOne(company);
      ctx.log(`${company.name}: ${offers.length} open roles`);
      out.push(...offers);
    } catch (err) {
      failures++;
      ctx.log(`${company.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (companies.length && failures === companies.length) {
    throw new Error(`All ${companies.length} ${ats} boards failed`);
  }
  return out;
}

export const greenhouseAdapter: SourceAdapter = {
  type: "greenhouse",
  label: "Greenhouse job boards",
  defaultIntervalMinutes: 360,
  fetchOffers: (ctx) =>
    eachCompany(ctx, "greenhouse", async (c) => {
      const data = await ctx.fetch.json<{ jobs: GreenhouseJob[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.slug)}/jobs?content=true`,
      );
      return data.jobs.map((j) => normalizeGreenhouse(c, j, ctx.sourceId));
    }),
};

export const leverAdapter: SourceAdapter = {
  type: "lever",
  label: "Lever job boards",
  defaultIntervalMinutes: 360,
  fetchOffers: (ctx) =>
    eachCompany(ctx, "lever", async (c) => {
      const data = await ctx.fetch.json<LeverPosting[]>(
        `https://api.lever.co/v0/postings/${encodeURIComponent(c.slug)}?mode=json`,
      );
      return data.map((p) => normalizeLever(c, p, ctx.sourceId));
    }),
};

export const ashbyAdapter: SourceAdapter = {
  type: "ashby",
  label: "Ashby job boards",
  defaultIntervalMinutes: 360,
  fetchOffers: (ctx) =>
    eachCompany(ctx, "ashby", async (c) => {
      const data = await ctx.fetch.json<{ jobs: AshbyJob[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.slug)}?includeCompensation=true`,
      );
      return data.jobs
        .filter((j) => j.isListed !== false)
        .map((j) => normalizeAshby(c, j, ctx.sourceId));
    }),
};

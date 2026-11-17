// Y Combinator startup jobs (design D5): public pages under ycombinator.com/jobs, parsed from the
// page's embedded Inertia props with an HTML fallback. No account, no login; the apply link
// goes to Work at a Startup and is opened by the owner.
import {
  keywordRegex,
  parseCompensation,
  prefilter,
  type NormalizedOfferInput,
} from "@job-radar/core";
import * as cheerio from "cheerio";
import type { SourceAdapter, SourceContext } from "../types";
import { htmlToText, inferEngagement, inferRemotePolicy, regionsFrom } from "../util";

const BASE = "https://www.ycombinator.com";

export interface YcPosting {
  id: number;
  title: string;
  url: string;
  applyUrl?: string;
  location?: string;
  type?: string;
  role?: string;
  roleSpecificType?: string;
  salaryRange?: string;
  equityRange?: string;
  minExperience?: string;
  visa?: string;
  skills?: string[];
  companyName: string;
  companyUrl?: string;
  companyBatchName?: string;
  companyOneLiner?: string;
  createdAt?: string;
  description?: string;
}

interface YcCompany {
  website?: string;
  team_size?: number;
  batch_name?: string;
  one_liner?: string;
  location?: string;
}

export function readInertiaProps<T>(html: string): T | null {
  const $ = cheerio.load(html);
  const raw = $("[data-page]").first().attr("data-page");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { props: T }).props;
  } catch {
    return null;
  }
}

/** HTML fallback when the embedded data is missing: job links with their titles only. */
export function parseListingHtml(html: string): YcPosting[] {
  const $ = cheerio.load(html);
  const out: YcPosting[] = [];
  $('a[href*="/companies/"][href*="/jobs/"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = /\/companies\/([^/]+)\/jobs\/([a-z0-9]+)-/i.exec(href);
    const title = $(a).text().trim();
    if (!m || !title) return;
    out.push({
      id: Number.NaN,
      title,
      url: href,
      companyName: (m[1] ?? "").replace(/-/g, " "),
      companyUrl: `/companies/${m[1]}`,
    });
  });
  return out;
}

/** "$120K - $180K" or "1.0% - 2.0%". */
function parseEquity(range: string | undefined): { min: number | null; max: number | null } {
  const nums = [...(range ?? "").matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null };
}

export function normalizeYc(
  p: YcPosting,
  company: YcCompany | null,
  sourceId = "ycombinator",
): NormalizedOfferInput {
  const url = p.url.startsWith("http") ? p.url : `${BASE}${p.url}`;
  const equity = parseEquity(p.equityRange);
  const terms = [p.location, p.visa].filter(Boolean).join(" · ");
  const description = [
    p.description ? htmlToText(p.description.replace(/&#x27;/g, "'")) : "",
    p.visa ? `Visa / location terms: ${p.visa}` : "",
    p.minExperience ? `Minimum experience: ${p.minExperience}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    sourceId,
    externalId: Number.isFinite(p.id) ? String(p.id) : url,
    sourceUrl: url,
    title: p.title.trim(),
    companyName: p.companyName,
    companyWebsite: company?.website ?? null,
    location: terms || null,
    remotePolicy: inferRemotePolicy(p.location),
    regions: regionsFrom(p.location, p.visa),
    engagementType: inferEngagement(p.type, p.title),
    compensation: parseCompensation(p.salaryRange),
    equityMin: equity.min,
    equityMax: equity.max,
    description: description || `${p.title} at ${p.companyName}. ${p.companyOneLiner ?? ""}`,
    skills: p.skills ?? [],
    applyMethod: "Work at a Startup (open manually)",
    applyUrl: url,
    companyMeta: {
      yc_batch: p.companyBatchName ?? company?.batch_name ?? null,
      one_liner: p.companyOneLiner ?? company?.one_liner ?? null,
      team_size: company?.team_size ?? null,
      visa: p.visa ?? null,
      role_type: p.roleSpecificType ?? null,
      posted: p.createdAt ? `${p.createdAt} ago` : null,
    },
    raw: { ...p, description: undefined },
  };
}

function settingsList(ctx: SourceContext, key: string, fallback: string[]): string[] {
  const v = ctx.settings[key];
  return Array.isArray(v) ? v.map(String) : fallback;
}

const ROLE_PAGES = new Set([
  "software-engineer",
  "designer",
  "product-manager",
  "recruiting-hr",
  "sales-manager",
  "marketing",
  "support",
  "operations",
  "science",
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export const ycombinatorAdapter: SourceAdapter = {
  type: "ycombinator",
  label: "Y Combinator startup jobs",
  defaultIntervalMinutes: 360,
  async fetchOffers(ctx) {
    const roles = settingsList(ctx, "roles", ["software-engineer"]);
    const titleKeywords = settingsList(ctx, "title_keywords", []);
    const remoteOnly = ctx.settings["remote_only"] !== false;
    const pages = roles.filter((r) => ROLE_PAGES.has(r));
    if (!pages.length) pages.push("software-engineer");
    // Non-page values (full-stack, ai-ml, ...) filter on the posting's role subtype.
    const subtypes = roles.filter((r) => !ROLE_PAGES.has(r)).map(norm);
    const subtypeAliases: Record<string, string[]> = {
      fullstack: ["fullstack"],
      frontend: ["frontend"],
      aiml: ["machinelearning", "aiml", "ml", "ai"],
      engineeringmanager: ["engineeringmanager", "eng manager", "management"],
    };
    const wanted = subtypes.flatMap((s) => subtypeAliases[s] ?? [s]).map(norm);

    const seen = new Map<number | string, YcPosting>();
    for (const role of pages) {
      const url = `${BASE}/jobs/role/${role}${remoteOnly ? "/remote" : ""}`;
      const html = await ctx.fetch.text(url);
      const props = readInertiaProps<{ jobPostings?: YcPosting[] }>(html);
      const postings = props?.jobPostings ?? parseListingHtml(html);
      ctx.log(`${role}: ${postings.length} postings${props ? "" : " (HTML fallback)"}`);
      for (const p of postings) seen.set(Number.isFinite(p.id) ? p.id : p.url, p);
    }

    const keep = [...seen.values()].filter((p) => {
      if (titleKeywords.some((k) => keywordRegex(k).test(p.title))) return true;
      if (!wanted.length) return true;
      const t = norm(p.roleSpecificType ?? "");
      return wanted.some((w) => t.includes(w));
    });
    ctx.log(`kept ${keep.length} of ${seen.size} after role filter`);

    const out: NormalizedOfferInput[] = [];
    for (const p of keep) {
      if (ctx.signal?.aborted) break;
      let company: YcCompany | null = null;
      // Only open job pages for postings that can pass the pre-filter (polite and cheaper).
      const quick = prefilter(
        {
          title: p.title,
          description: `${p.companyOneLiner ?? ""} ${(p.skills ?? []).join(" ")} ${p.roleSpecificType ?? ""}`,
        },
        {
          include: [],
          exclude: ctx.preferences.keywords.exclude,
          title_include: ctx.preferences.keywords.title_include,
        },
      );
      if (quick.pass && Number.isFinite(p.id)) {
        try {
          const detail = readInertiaProps<{ job?: YcPosting; company?: YcCompany }>(
            await ctx.fetch.text(p.url.startsWith("http") ? p.url : `${BASE}${p.url}`),
          );
          if (detail?.job) Object.assign(p, { description: detail.job.description });
          company = detail?.company ?? null;
        } catch (err) {
          ctx.log(
            `${p.companyName}: job page failed (${err instanceof Error ? err.message : String(err)})`,
          );
        }
      }
      out.push(normalizeYc(p, company, ctx.sourceId));
    }
    return out;
  },
};

// Darwin Recruitment (STEM recruiter): the public job feed of its WordPress Job Manager
// board, https://www.darwinrecruitment.com/?feed=job_feed. Allowed by robots.txt; no login.
import { parseCompensation, type NormalizedOfferInput } from "@job-radar/core";
import Parser from "rss-parser";
import type { SourceAdapter } from "../types";
import { htmlToText, inferEngagement, inferRemotePolicy, regionsFrom, toDate } from "../util";

const FEED = "https://www.darwinrecruitment.com/?feed=job_feed";
/** The feed's page size; one request returns the newest jobs. */
export const DARWIN_PAGE_SIZE = 100;

type DarwinItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  content?: string;
  "content:encoded"?: string;
  location?: string;
  jobType?: string;
  category?: string;
  company?: string;
};

const parser = new Parser<Record<string, never>, DarwinItem>({
  customFields: {
    item: [
      ["job_listing:location", "location"],
      ["job_listing:job_type", "jobType"],
      ["job_listing:job_category", "category"],
      ["job_listing:company", "company"],
      "content:encoded",
    ],
  },
});

/** "Hybrid", "2 days on site" or "Remote work offering – 40-60%" mean hybrid, not remote. */
function remotePolicyOf(location: string, text: string): NormalizedOfferInput["remotePolicy"] {
  const head = text.slice(0, 1200).toLowerCase();
  if (
    /\bhybrid\b|\d+\s*(?:-|to)?\s*\d*\s*days?\s*(?:on-?site|in (?:the )?office)|remote work offering/.test(
      head,
    )
  )
    return "hybrid";
  const locationLine = /location:\s*([^\n]{0,80})/i.exec(text)?.[1] ?? "";
  return inferRemotePolicy(location, locationLine);
}

export function normalizeDarwin(
  item: DarwinItem,
  sourceId = "darwin",
): NormalizedOfferInput | null {
  const title = item.title?.trim();
  const link = item.link?.trim();
  if (!title || !link) return null;
  const ref = /\/job\/(\d{6,})-/.exec(link)?.[1];
  const description = htmlToText(item["content:encoded"] ?? item.content);
  const location = item.location?.trim() || null;
  const salary =
    /(?:salary|rate|compensation)[^\n]{0,120}/i.exec(description)?.[0] ??
    /[€£$]\s?\d[\d,.]*\s*(?:k\b)?[^\n]{0,60}/.exec(description)?.[0] ??
    null;
  return {
    sourceId,
    externalId: ref ?? link,
    sourceUrl: link,
    title,
    // The client is not named; the offer is listed under the recruiter.
    companyName: item.company?.trim() || "Darwin Recruitment",
    location,
    remotePolicy: remotePolicyOf(location ?? "", description),
    regions: regionsFrom(location),
    engagementType: inferEngagement(item.jobType, title),
    compensation: parseCompensation(salary),
    postedAt: toDate(item.pubDate),
    description,
    skills: [],
    applyMethod: "external",
    applyUrl: link,
    companyMeta: { recruiter: true },
    raw: { jobType: item.jobType, category: item.category, location: item.location },
  };
}

export async function parseDarwinFeed(
  xml: string,
  sourceId?: string,
): Promise<NormalizedOfferInput[]> {
  const feed = await parser.parseString(xml);
  return feed.items
    .map((i) => normalizeDarwin(i, sourceId))
    .filter((o): o is NormalizedOfferInput => o !== null);
}

export const darwinAdapter: SourceAdapter = {
  type: "darwin",
  label: "Darwin Recruitment",
  defaultIntervalMinutes: 360,
  async fetchOffers(ctx) {
    // Optional `keywords` setting: one feed search per keyword; otherwise the newest jobs.
    const keywords = Array.isArray(ctx.settings["keywords"])
      ? (ctx.settings["keywords"] as unknown[]).filter((k): k is string => typeof k === "string")
      : [];
    const searches = keywords.length ? keywords : [""];
    const seen = new Set<string>();
    const out: NormalizedOfferInput[] = [];
    for (const keyword of searches) {
      const url = new URL(FEED);
      url.searchParams.set("posts_per_page", String(DARWIN_PAGE_SIZE));
      if (keyword) url.searchParams.set("search_keywords", keyword);
      const offers = await parseDarwinFeed(await ctx.fetch.text(url.toString()), ctx.sourceId);
      ctx.log(`${keyword || "newest"}: ${offers.length} jobs`);
      for (const o of offers) {
        if (seen.has(o.externalId)) continue;
        seen.add(o.externalId);
        out.push(o);
      }
    }
    return out;
  },
};

// Public remote-job feeds: RemoteOK JSON and We Work Remotely RSS (design D5).
import { parseCompensation, type NormalizedOfferInput } from "@job-radar/core";
import Parser from "rss-parser";
import type { SourceAdapter } from "../types";
import { htmlToText, inferEngagement, regionsFrom, toDate } from "../util";

// ---------- RemoteOK ----------
interface RemoteOkJob {
  id?: string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  legal?: string;
}

export function normalizeRemoteOk(
  j: RemoteOkJob,
  sourceId = "remoteok",
): NormalizedOfferInput | null {
  if (!j.id || !j.position || !j.company) return null; // first element is the legal notice
  const url = j.url ?? `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`;
  const hasSalary = Boolean(j.salary_min || j.salary_max);
  return {
    sourceId,
    externalId: String(j.id),
    sourceUrl: url,
    title: j.position.trim(),
    companyName: j.company.trim(),
    location: j.location || null,
    remotePolicy: "remote",
    regions: regionsFrom(j.location),
    engagementType: inferEngagement(...(j.tags ?? []), j.position),
    compensation: hasSalary
      ? {
          min: j.salary_min ? j.salary_min * 100 : null,
          max: j.salary_max ? j.salary_max * 100 : null,
          currency: "USD",
          period: "year",
        }
      : null,
    postedAt: toDate(j.date ?? (j.epoch ? j.epoch * 1000 : null)),
    description: htmlToText(j.description),
    skills: j.tags ?? [],
    applyMethod: "external",
    applyUrl: j.apply_url ?? url,
    companyMeta: {},
    raw: { ...j, description: undefined },
  };
}

export const remoteOkAdapter: SourceAdapter = {
  type: "remoteok",
  label: "RemoteOK",
  defaultIntervalMinutes: 180,
  async fetchOffers(ctx) {
    const data = await ctx.fetch.json<RemoteOkJob[]>("https://remoteok.com/api");
    return data
      .map((j) => normalizeRemoteOk(j, ctx.sourceId))
      .filter((o): o is NormalizedOfferInput => o !== null);
  },
};

// ---------- We Work Remotely ----------
type WwrItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  content?: string;
  region?: string;
  country?: string;
  skills?: string;
  type?: string;
  category?: string;
};

export const WWR_DEFAULT_CATEGORIES = [
  "remote-full-stack-programming-jobs",
  "remote-back-end-programming-jobs",
  "remote-front-end-programming-jobs",
];

export function normalizeWwr(
  item: WwrItem,
  sourceId = "weworkremotely",
): NormalizedOfferInput | null {
  if (!item.title || !item.link) return null;
  // Titles are "Company: Role".
  const idx = item.title.indexOf(":");
  const company = idx > 0 ? item.title.slice(0, idx).trim() : "Unknown company";
  const title = idx > 0 ? item.title.slice(idx + 1).trim() : item.title.trim();
  const description = htmlToText(item.content);
  const location = [item.region, item.country].filter(Boolean).join(", ") || null;
  return {
    sourceId,
    externalId: item.guid ?? item.link,
    sourceUrl: item.link,
    title,
    companyName: company,
    location,
    remotePolicy: "remote",
    regions: regionsFrom(location),
    engagementType: inferEngagement(item.type, title),
    compensation: parseCompensation(description.match(/salary[^\n]{0,80}/i)?.[0] ?? null),
    postedAt: toDate(item.pubDate),
    description,
    skills: item.skills
      ? item.skills
          .split(/,\s*|\s+and\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    applyMethod: "external",
    applyUrl: item.link,
    companyMeta: {},
    raw: { title: item.title, region: item.region, type: item.type, category: item.category },
  };
}

const wwrParser = new Parser<Record<string, never>, WwrItem>({
  customFields: { item: ["region", "country", "skills", "type", "category"] },
});

export async function parseWwrFeed(
  xml: string,
  sourceId?: string,
): Promise<NormalizedOfferInput[]> {
  const feed = await wwrParser.parseString(xml);
  return feed.items
    .map((i) => normalizeWwr(i, sourceId))
    .filter((o): o is NormalizedOfferInput => o !== null);
}

export const weWorkRemotelyAdapter: SourceAdapter = {
  type: "weworkremotely",
  label: "We Work Remotely",
  defaultIntervalMinutes: 180,
  async fetchOffers(ctx) {
    const categories = Array.isArray(ctx.settings["categories"])
      ? (ctx.settings["categories"] as string[])
      : WWR_DEFAULT_CATEGORIES;
    const out: NormalizedOfferInput[] = [];
    for (const cat of categories) {
      const xml = await ctx.fetch.text(
        `https://weworkremotely.com/categories/${encodeURIComponent(cat)}.rss`,
      );
      const offers = await parseWwrFeed(xml, ctx.sourceId);
      ctx.log(`${cat}: ${offers.length} items`);
      out.push(...offers);
    }
    return out;
  },
};

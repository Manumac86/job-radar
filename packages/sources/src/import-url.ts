// "Add offer from a link" (job-ingestion spec, "Manual import"): the owner pastes the URL of an
// offer, usually one they applied to outside the app. One read-only GET, no login, no cookies.
import {
  UNTRUSTED_DATA_RULES,
  callStructured,
  parseCompensation,
  wrapUntrusted,
  type LlmBudget,
  type LlmClient,
  type NormalizedOfferInput,
} from "@job-radar/core";
import * as cheerio from "cheerio";
import { z } from "zod";
import type { PoliteFetcher } from "./http";
import { htmlToText, inferEngagement, inferRemotePolicy, regionsFrom, toDate } from "./util";

export const MANUAL_SOURCE_ID = "manual";

export class ImportError extends Error {
  override readonly name = "ImportError";
}

/** Only public http(s) pages: never the worker itself or the local network. */
export function checkImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("That is not a valid link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new ImportError("Only http and https links can be imported");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(host)
  )
    throw new ImportError("Local and private network links cannot be imported");
  return url;
}

/** LinkedIn job id from /jobs/view/<id>, /jobs/view/<slug>-<id> or ?currentJobId=<id>. */
export function linkedInJobId(url: URL): string | null {
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  const fromParam = url.searchParams.get("currentJobId");
  if (fromParam && /^\d{6,}$/.test(fromParam)) return fromParam;
  const m = /\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/.exec(url.pathname);
  return m?.[1] ?? null;
}

/** "3 days ago", "1 week ago", "2 hours ago" → a date. */
export function parseRelativeDate(text: string, now: Date): Date | null {
  const m = /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { minute: 60e3, hour: 3600e3, day: 864e5, week: 6048e5, month: 2592e6 }[
    (m[2] ?? "day").toLowerCase() as "day"
  ];
  return new Date(now.getTime() - n * unit);
}

/** LinkedIn's public job page (the one shown to visitors who are not logged in). */
export function parseLinkedInGuest(
  html: string,
  jobId: string,
  now = new Date(),
): NormalizedOfferInput | null {
  const $ = cheerio.load(html);
  const text = (sel: string) => $(sel).first().text().replace(/\s+/g, " ").trim();
  const title = text(".top-card-layout__title") || text(".topcard__title");
  const company = text(".topcard__org-name-link") || text(".topcard__flavor");
  if (!title || !company) return null;
  const location = text(".topcard__flavor--bullet") || null;
  const criteria: Record<string, string> = {};
  $(".description__job-criteria-item").each((_, el) => {
    const k = $(el).find("h3").text().trim();
    const v = $(el).find("span").text().replace(/\s+/g, " ").trim();
    if (k && v) criteria[k] = v;
  });
  const description = htmlToText($(".show-more-less-html__markup").first().html() ?? "");
  const companyUrl = $(".topcard__org-name-link").attr("href")?.split("?")[0] ?? null;
  const url = `https://www.linkedin.com/jobs/view/${jobId}/`;
  const employment = criteria["Employment type"] ?? "";
  return {
    sourceId: MANUAL_SOURCE_ID,
    externalId: `linkedin:${jobId}`,
    sourceUrl: url,
    title,
    companyName: company,
    location,
    remotePolicy: inferRemotePolicy(location, title, description.slice(0, 3000)),
    regions: regionsFrom(location),
    engagementType: inferEngagement(employment, title),
    compensation: parseCompensation(description),
    postedAt: parseRelativeDate(text(".posted-time-ago__text"), now),
    description,
    applyMethod: "linkedin (open manually)",
    applyUrl: url,
    companyMeta: { via: "LinkedIn link", linkedin: companyUrl, ...criteria },
    raw: { site: "linkedin", criteria },
  };
}

interface JsonLdPosting {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  hiringOrganization?: { name?: string; sameAs?: string; url?: string } | string;
  jobLocation?: unknown;
  applicantLocationRequirements?: unknown;
  baseSalary?: {
    currency?: string;
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string };
  };
  identifier?: { value?: string | number } | string;
}

function placeNames(v: unknown): string[] {
  const out: string[] = [];
  const visit = (x: unknown) => {
    if (!x) return;
    if (Array.isArray(x)) return x.forEach(visit);
    if (typeof x === "string") return void out.push(x);
    if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o["name"] === "string") out.push(o["name"]);
      const a = o["address"] as Record<string, unknown> | undefined;
      if (a)
        out.push(
          [a["addressLocality"], a["addressRegion"], a["addressCountry"]]
            .map((p) => (typeof p === "object" && p ? (p as { name?: string }).name : p))
            .filter((p): p is string => typeof p === "string" && p.length > 0)
            .join(", "),
        );
    }
  };
  visit(v);
  return [...new Set(out.filter(Boolean))];
}

const PERIOD: Record<string, "hour" | "day" | "week" | "month" | "year"> = {
  HOUR: "hour",
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

/** schema.org JobPosting in JSON-LD: Greenhouse, Lever, Ashby, Workable and most job sites. */
export function parseJsonLdJobPosting(html: string, url: URL): NormalizedOfferInput | null {
  const $ = cheerio.load(html);
  const postings: JsonLdPosting[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text()) as unknown;
      const items = Array.isArray(data)
        ? data
        : ((data as { "@graph"?: unknown[] })["@graph"] ?? [data]);
      for (const item of items as JsonLdPosting[]) {
        const t = item?.["@type"];
        if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting")))
          postings.push(item);
      }
    } catch {
      // Ignore broken JSON-LD blocks.
    }
  });
  const p = postings[0];
  if (!p?.title) return null;
  const org =
    typeof p.hiringOrganization === "string"
      ? { name: p.hiringOrganization }
      : p.hiringOrganization;
  if (!org?.name) return null;
  const description = htmlToText(p.description ?? "");
  const places = placeNames(p.jobLocation);
  const applicantPlaces = placeNames(p.applicantLocationRequirements);
  const remote = p.jobLocationType === "TELECOMMUTE";
  const location =
    [remote ? "Remote" : "", ...applicantPlaces, ...places].filter(Boolean).join(" · ") || null;
  const v = p.baseSalary?.value;
  const cur = p.baseSalary?.currency?.toUpperCase();
  const min = v?.minValue ?? v?.value;
  const max = v?.maxValue ?? v?.value;
  const compensation =
    cur && /^[A-Z]{3}$/.test(cur) && (min || max)
      ? {
          min: min ? Math.round(min * 100) : null,
          max: max ? Math.round(max * 100) : null,
          currency: cur,
          period: PERIOD[(v?.unitText ?? "").toUpperCase()] ?? null,
        }
      : parseCompensation(description);
  const id =
    typeof p.identifier === "object" && p.identifier?.value
      ? String(p.identifier.value)
      : `${url.hostname}${url.pathname}`.replace(/\/$/, "");
  const employment = [p.employmentType].flat().filter(Boolean).join(" ").replace(/_/g, "-");
  return {
    sourceId: MANUAL_SOURCE_ID,
    externalId: `url:${url.hostname}:${id}`,
    sourceUrl: url.toString(),
    title: p.title.trim(),
    companyName: org.name.trim(),
    companyWebsite: org.sameAs ?? org.url ?? null,
    location,
    remotePolicy: remote
      ? "remote"
      : inferRemotePolicy(location, p.title, description.slice(0, 3000)),
    regions: regionsFrom(location),
    engagementType: inferEngagement(employment, p.title),
    compensation,
    postedAt: toDate(p.datePosted ?? null),
    description,
    applyMethod: "open manually",
    applyUrl: url.toString(),
    companyMeta: { via: "link (JSON-LD)" },
    raw: { jsonLd: true },
  };
}

const llmOfferSchema = z
  .object({
    is_job_offer: z.boolean(),
    title: z.string().max(200),
    company: z.string().max(150),
    location: z.string().max(200).nullable(),
    remote_policy: z.enum(["remote", "hybrid", "onsite", "unknown"]),
    engagement_type: z.enum(["contract", "part-time", "full-time", "freelance", "unknown"]),
    compensation_text: z.string().max(200).nullable(),
  })
  .strict();

/** Last resort: page text (or text the owner pasted) read by Claude. */
export async function extractOfferWithLlm(
  text: string,
  url: URL,
  llm: { client: LlmClient; budget: LlmBudget; model: string },
): Promise<NormalizedOfferInput | null> {
  const body = text.slice(0, 12_000);
  const res = await callStructured(
    { client: llm.client, budget: llm.budget },
    {
      kind: "extraction",
      model: llm.model,
      system: `Extract the job or freelance offer described on this page. If the page is not a single job offer (a login wall, a search page, an error), set is_job_offer to false.\n${UNTRUSTED_DATA_RULES}`,
      prompt: `URL: ${url.toString()}\n\n${wrapUntrusted("page", body)}`,
      schema: llmOfferSchema,
      schemaName: "imported_offer",
    },
  );
  const o = res.value;
  if (!o.is_job_offer || !o.title.trim() || !o.company.trim()) return null;
  const liId = linkedInJobId(url);
  return {
    sourceId: MANUAL_SOURCE_ID,
    externalId: liId ? `linkedin:${liId}` : `url:${url.hostname}${url.pathname}`.replace(/\/$/, ""),
    sourceUrl: url.toString(),
    title: o.title.trim(),
    companyName: o.company.trim(),
    location: o.location,
    remotePolicy: o.remote_policy,
    regions: regionsFrom(o.location),
    engagementType: o.engagement_type,
    compensation: parseCompensation(o.compensation_text ?? body),
    description: body,
    applyMethod: "open manually",
    applyUrl: url.toString(),
    companyMeta: { via: "link (extracted by Claude)" },
    raw: { llm: true },
  };
}

export interface ImportResult {
  offer: NormalizedOfferInput;
  method: "linkedin" | "json-ld" | "llm";
}

/**
 * Fetches one page and turns it into an offer: LinkedIn's public job page, then JSON-LD, then
 * Claude on the page text. When the page cannot be read (login wall, blocked), the text the
 * owner pasted is used instead.
 */
export async function importOfferFromUrl(
  rawUrl: string,
  deps: {
    fetcher: PoliteFetcher;
    llm?: { client: LlmClient; budget: LlmBudget; model: string } | null;
    pastedText?: string | null;
    now?: Date;
    log?: (line: string) => void;
  },
): Promise<ImportResult> {
  const url = checkImportUrl(rawUrl);
  const now = deps.now ?? new Date();
  const log = deps.log ?? (() => {});
  const pasted = deps.pastedText?.trim() || null;
  let pageText = "";

  const liId = linkedInJobId(url);
  if (liId) {
    // Public guest endpoint: the same page a logged-out visitor sees. No session is used.
    const guest = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${liId}`;
    try {
      const html = await deps.fetcher.text(guest);
      const offer = parseLinkedInGuest(html, liId, now);
      if (offer) return { offer, method: "linkedin" };
      pageText = htmlToText(html);
    } catch (err) {
      log(`LinkedIn public page unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    try {
      const html = await deps.fetcher.text(url.toString(), {
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      const offer = parseJsonLdJobPosting(html, url);
      if (offer) return { offer, method: "json-ld" };
      const $ = cheerio.load(html);
      $("script, style, noscript, nav, footer, header, svg").remove();
      pageText = $("body")
        .text()
        .replace(/\s+\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    } catch (err) {
      log(`Page unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const text = pasted ?? pageText;
  if (!text || text.length < 200) {
    throw new ImportError(
      "Could not read this offer from the link. Paste the offer text in the box below and try again.",
    );
  }
  if (!deps.llm) {
    throw new ImportError("Claude is not available to read this page right now; try again later.");
  }
  const offer = await extractOfferWithLlm(text, url, deps.llm);
  if (!offer) {
    throw new ImportError(
      pasted
        ? "The pasted text does not look like a job offer."
        : "This page does not look like a job offer (a login wall?). Paste the offer text below and try again.",
    );
  }
  return { offer, method: "llm" };
}

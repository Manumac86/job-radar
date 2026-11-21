// Logged-in, read-only adapters (design D5, browser-sessions spec): Malt, Wellfound, Mercor,
// Upwork and LinkedIn. Disabled by default; they only read search and job pages through the
// ReadOnlyPage wrapper, with a page cap and 5–20 s random pauses.
import { parseCompensation, type NormalizedOfferInput } from "@job-radar/core";
import * as cheerio from "cheerio";
import { PageCapReachedError } from "../browser/guard";
import {
  BotCheckError,
  SessionExpiredError,
  isBotCheck,
  isLoginWall,
  type SiteDefinition,
} from "../browser/sessions";
import type { SourceAdapter, SourceContext } from "../types";
import { SITE_RULES, parseWithRule } from "./email";
import { SIMPLEAPPLY_SITE } from "./simpleapply";
import { inferEngagement, inferRemotePolicy, regionsFrom } from "../util";

interface LoggedInSite extends SiteDefinition {
  /** Search pages to read, built from the owner's keywords. */
  searchUrls(keywords: string[]): string[];
  rule: (typeof SITE_RULES)[number];
  /** A selector that appears once the result list has rendered. */
  resultsSelector?: string;
  /** Site-specific card reader, used alongside the job-link rule. */
  parseCards?: (html: string, sourceId: string, now: Date) => NormalizedOfferInput[];
}

const q = (s: string) => encodeURIComponent(s);
const rule = (site: string) => {
  const r = SITE_RULES.find((x) => x.site === site);
  if (!r) throw new Error(`No link rule for ${site}`);
  return r;
};

export const LOGGED_IN_SITES: Record<string, LoggedInSite> = {
  malt: {
    id: "malt",
    label: "Malt (logged-in)",
    loginUrl: "https://www.malt.es/signin",
    checkUrl: "https://www.malt.es/dashboard",
    loginUrlPattern: /\/(signin|login|auth)\b/i,
    searchUrls: () => ["https://www.malt.es/dashboard/freelancer/projects"],
    rule: rule("malt"),
  },
  wellfound: {
    id: "wellfound",
    label: "Wellfound (logged-in)",
    loginUrl: "https://wellfound.com/login",
    checkUrl: "https://wellfound.com/jobs",
    loginUrlPattern: /\/(login|signup)\b/i,
    searchUrls: () => ["https://wellfound.com/jobs"],
    rule: rule("wellfound"),
    resultsSelector: 'a[href^="/jobs/"]',
    parseCards: (html, sourceId, now) => parseWellfoundCards(html, sourceId, now),
  },
  mercor: {
    id: "mercor",
    label: "Mercor (logged-in)",
    loginUrl: "https://work.mercor.com/",
    checkUrl: "https://work.mercor.com/explore",
    loginUrlPattern: /\/(login|sign-?in|auth)\b/i,
    searchUrls: () => ["https://work.mercor.com/explore"],
    rule: {
      site: "mercor",
      sender: /mercor\.com/i,
      jobUrl: /https?:\/\/work\.mercor\.com\/(?:jobs|listings|explore)\/([a-z0-9_-]{6,})/i,
      engagementHint: "contract",
    },
    resultsSelector: 'a[data-test="listing-card"], a[href*="/jobs/"], a[href*="/listings/"]',
    parseCards: (html, sourceId, now) => parseMercorCards(html, sourceId, now),
  },
  upwork: {
    id: "upwork",
    label: "Upwork (logged-in)",
    loginUrl: "https://www.upwork.com/ab/account-security/login",
    checkUrl: "https://www.upwork.com/nx/find-work/",
    loginUrlPattern: /account-security\/login|\/login\b/i,
    searchUrls: (kw) =>
      kw.slice(0, 3).map((k) => `https://www.upwork.com/nx/search/jobs/?q=${q(k)}&sort=recency`),
    rule: rule("upwork"),
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn (logged-in)",
    loginUrl: "https://www.linkedin.com/login",
    checkUrl: "https://www.linkedin.com/jobs/",
    loginUrlPattern: /\/(login|uas\/login|checkpoint|authwall)\b/i,
    // f_WT=2: remote only.
    searchUrls: (kw) =>
      kw
        .slice(0, 3)
        .map((k) => `https://www.linkedin.com/jobs/search/?keywords=${q(k)}&f_WT=2&sortBy=DD`),
    rule: rule("linkedin"),
    resultsSelector: '[componentkey^="job-card-component-ref-"], a[href*="/jobs/view/"]',
    parseCards: (html, sourceId, now) => parseLinkedInCards(html, sourceId, now),
  },
};

/** Job links on a search page, reusing the alert-email card parser. */
export function parseSearchPage(
  site: LoggedInSite,
  html: string,
  pageUrl: string,
  sourceId: string,
  now: Date,
): NormalizedOfferInput[] {
  // Relative links become absolute so the site's job-URL rule matches them.
  const origin = new URL(pageUrl).origin;
  const absolute = html.replace(/href="\/(?!\/)/g, `href="${origin}/`);
  return parseWithRule(
    {
      messageId: pageUrl,
      from: site.id,
      subject: `${site.label} search`,
      date: now,
      html: absolute,
      text: null,
    },
    site.rule,
    sourceId,
  ).map((o) => ({
    ...o,
    externalId: `${site.id}:${o.externalId.split(":").slice(1).join(":")}`,
    applyMethod: `${site.label.replace(" (logged-in)", "")} (open manually)`,
    companyMeta: { ...o.companyMeta, via: `${site.id} search (logged-in, read-only)` },
  }));
}

/** LinkedIn's job search (2026 "search-results" UI): cards carry the job id, no /jobs/view/ links. */
export const LINKEDIN_CARD_SELECTOR = '[componentkey^="job-card-component-ref-"]';

const RELATIVE_UNITS: [RegExp, number][] = [
  [/minut/i, 60_000],
  [/hora|hour/i, 3_600_000],
  [/d[ií]a|day/i, 86_400_000],
  [/semana|week/i, 7 * 86_400_000],
  [/mes|month/i, 30 * 86_400_000],
  [/a[ñn]o|year/i, 365 * 86_400_000],
];

/** "Publicado hace 2 semanas", "hace 1 día", "3 days ago", "1 hace año" → a date before `now`. */
export function relativePostedAt(text: string, now: Date): Date | null {
  const n = /(\d+)/.exec(text);
  if (!n || !/hace|ago/i.test(text)) return null;
  const unit = RELATIVE_UNITS.find(([re]) => re.test(text.replace(n[0], "")));
  return unit ? new Date(now.getTime() - Number(n[1]) * unit[1]) : null;
}

/** Reads the job cards of LinkedIn's new search page. Language-agnostic (the UI follows the account). */
export function parseLinkedInCards(
  html: string,
  sourceId: string,
  now: Date,
): NormalizedOfferInput[] {
  const $ = cheerio.load(html);
  const out = new Map<string, NormalizedOfferInput>();
  $(LINKEDIN_CARD_SELECTOR).each((_, el) => {
    const id = /job-card-component-ref-(\d{6,})/.exec($(el).attr("componentkey") ?? "")?.[1];
    if (!id || out.has(id)) return;
    const card = $(el);
    const paras = card
      .find("p")
      .toArray()
      .map((p) => $(p));
    const titleP = paras[0];
    if (!titleP) return;
    // The visible title is the aria-hidden copy; the other span adds "(Verified job)" for readers.
    const title = (titleP.find('span[aria-hidden="true"]').first().text() || titleP.text())
      .replace(/\s+/g, " ")
      .trim();
    const texts = paras.slice(1).map((p) => p.text().replace(/\s+/g, " ").trim());
    const companyName = texts[0] || "Unknown company";
    const location = texts[1] || null;
    const rest = texts.slice(2);
    const salary = rest.find((t) => /\d\s*k?\s*[A-Z]{3}\s*\/|[$€£]\s*\d/i.test(t)) ?? null;
    const postedText = rest.find((t) => /hace|ago/i.test(t)) ?? "";
    if (!title) return;
    const url = `https://www.linkedin.com/jobs/view/${id}`;
    out.set(id, {
      sourceId,
      externalId: `linkedin:${id}`,
      sourceUrl: url,
      title,
      companyName,
      location,
      remotePolicy: inferRemotePolicy(location),
      regions: regionsFrom(location),
      engagementType: inferEngagement(undefined, rest.join(" "), title),
      // "98K GBP/yr - 115K GBP/yr" → "GBP 98K - 115K/yr" so the range is read as one.
      compensation: parseCompensation(
        salary?.replace(
          /^(\S+)\s+([A-Z]{3})(\s*\/\s*\w+)\s*[-–]\s*(\S+)\s+[A-Z]{3}\s*\/\s*\w+/,
          "$2 $1 - $4$3",
        ) ?? null,
      ),
      postedAt: relativePostedAt(postedText, now) ?? now,
      description: [title, companyName, location, ...rest].filter(Boolean).join("\n"),
      applyMethod: "LinkedIn (open manually)",
      applyUrl: url,
      companyMeta: { via: "linkedin search (logged-in, read-only)" },
      raw: { site: "linkedin", lines: [title, ...texts] },
    });
  });
  return [...out.values()];
}

/** Mercor's explore page (2026): cards link to /explore?listingId=<id>, with title and rate. */
export function parseMercorCards(
  html: string,
  sourceId: string,
  now: Date,
): NormalizedOfferInput[] {
  const $ = cheerio.load(html);
  const out = new Map<string, NormalizedOfferInput>();
  $('a[data-test="listing-card"], a[href*="listingId="]').each((_, el) => {
    const a = $(el);
    const id = /[?&]listingId=([a-z0-9_-]{6,})/i.exec(a.attr("href") ?? "")?.[1];
    if (!id || out.has(id)) return;
    const title = (
      a.find('[data-test="listing-title"]').first().text() || a.find("h2,h3").first().text()
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!title) return;
    const rate = a
      .find('[data-test="listing-subtitle"]')
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const url = `https://work.mercor.com/explore?listingId=${id}`;
    out.set(id, {
      sourceId,
      externalId: `mercor:${id}`,
      sourceUrl: url,
      title,
      // Mercor contracts the work itself and does not name the end client.
      companyName: "Mercor",
      location: null,
      remotePolicy: "remote",
      regions: regionsFrom(title),
      engagementType: "contract",
      compensation: parseCompensation(rate.replace(/\/\s*task\b/i, "per project")),
      postedAt: now,
      description: [title, rate].filter(Boolean).join("\n"),
      applyMethod: "Mercor (open manually)",
      applyUrl: url,
      companyMeta: { via: "mercor search (logged-in, read-only)" },
      raw: { site: "mercor", lines: [title, rate] },
    });
  });
  return [...out.values()];
}

/** Wellfound job rows: a company logo link, the job link, then "Company • " and "Remote only • Spain • $40k – $60k • No equity • today". */
export function parseWellfoundCards(
  html: string,
  sourceId: string,
  now: Date,
): NormalizedOfferInput[] {
  const $ = cheerio.load(html);
  const out = new Map<string, NormalizedOfferInput>();
  $('a[href^="/jobs/"], a[href*="wellfound.com/jobs/"]').each((_, el) => {
    const a = $(el);
    const id = /\/jobs\/(\d+)/.exec(a.attr("href") ?? "")?.[1];
    if (!id || out.has(id)) return;
    let row = a.parent();
    for (let i = 0; i < 4 && !row.find('a[href*="/company/"]').length; i++) row = row.parent();
    if (!row.find('a[href*="/company/"]').length) return;
    const title = a.text().replace(/\s+/g, " ").trim();
    if (!title) return;
    const spans = a
      .parent()
      .next()
      .children("span")
      .toArray()
      .map((x) => $(x).text().replace(/\s+/g, " ").trim());
    const companyName =
      spans[0]?.replace(/\s*•\s*$/, "").trim() ||
      row
        .find('img[alt$="company logo"]')
        .first()
        .attr("alt")
        ?.replace(/\s*company logo$/, "") ||
      "Unknown company";
    const parts = (spans[1] ?? "")
      .split("•")
      .map((x) => x.trim())
      .filter(Boolean);
    const salary = parts.find((x) => /\d/.test(x) && /[$€£]|\b[A-Z]{3}\b/.test(x)) ?? null;
    const posted = parts.at(-1) ?? "";
    const location =
      parts
        .filter((x) => x !== salary && x !== posted && !/equity|more$|[₹$€£%]/i.test(x))
        .join(", ") || null;
    const url = `https://wellfound.com/jobs/${id}`;
    const day = 86_400_000;
    const postedAt = /^today$/i.test(posted)
      ? now
      : /^yesterday$/i.test(posted)
        ? new Date(now.getTime() - day)
        : (relativePostedAt(`${posted} ago`.replace(/ ago ago$/, " ago"), now) ?? now);
    out.set(id, {
      sourceId,
      externalId: `wellfound:${id}`,
      sourceUrl: url,
      title,
      companyName,
      location,
      remotePolicy: inferRemotePolicy(location),
      regions: regionsFrom(location),
      engagementType: inferEngagement(undefined, parts.join(" "), title),
      compensation: parseCompensation(salary),
      postedAt,
      description: [title, companyName, ...parts].join("\n"),
      applyMethod: "Wellfound (open manually)",
      applyUrl: url,
      companyMeta: { via: "wellfound search (logged-in, read-only)" },
      raw: { site: "wellfound", lines: [title, ...spans] },
    });
  });
  return [...out.values()];
}

function searchTerms(ctx: SourceContext): string[] {
  const custom = ctx.settings["queries"];
  if (Array.isArray(custom) && custom.length) return custom.map(String);
  // Role-like include keywords make the best searches.
  const k = ctx.preferences.keywords.include.filter((w) =>
    /engineer|cto|head|lead|manager|developer|ai|rag|next\.js/i.test(w),
  );
  return k.length ? k : ctx.preferences.keywords.include;
}

function adapterFor(site: LoggedInSite): SourceAdapter {
  return {
    type: site.id,
    label: site.label,
    defaultIntervalMinutes: 720,
    requiresLogin: true,
    async fetchOffers(ctx) {
      if (!ctx.browser) throw new Error("The isolated browser is not available in this worker");
      return ctx.browser.withSite(
        site,
        async (page) => {
          const out: NormalizedOfferInput[] = [];
          for (const url of site.searchUrls(searchTerms(ctx))) {
            try {
              await page.goto(url);
            } catch (err) {
              if (err instanceof PageCapReachedError) {
                ctx.log(err.message);
                break;
              }
              throw err;
            }
            if (site.resultsSelector) await page.waitFor(site.resultsSelector, 15_000);
            const html = await page.html();
            if (isBotCheck(html)) throw new BotCheckError(site.label.replace(" (logged-in)", ""));
            if (isLoginWall(site, page.url(), html)) throw new SessionExpiredError(site.id);
            // Site card readers know the layout best; the generic link rule fills any gaps.
            const found = site.parseCards?.(html, ctx.sourceId, ctx.now()) ?? [];
            const known = new Set(found.map((o) => o.externalId));
            for (const o of parseSearchPage(site, html, page.url(), ctx.sourceId, ctx.now()))
              if (!known.has(o.externalId)) found.push(o);
            ctx.log(`${new URL(page.url()).pathname}: ${found.length} job links`);
            if (!found.length)
              ctx.log(`no jobs read on ${page.url()}; the page layout may have changed`);
            out.push(...found);
          }
          return out;
        },
        ctx.log,
      );
    },
  };
}

export const loggedInAdapters: SourceAdapter[] = Object.values(LOGGED_IN_SITES).map(adapterFor);

/** Every site the owner can log in to from Settings → Sessions. */
export const SESSION_SITES: Record<string, SiteDefinition> = {
  ...LOGGED_IN_SITES,
  [SIMPLEAPPLY_SITE.id]: SIMPLEAPPLY_SITE,
};

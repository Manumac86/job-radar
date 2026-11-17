// Logged-in, read-only adapters (design D5, browser-sessions spec): Malt, Wellfound, Mercor,
// Upwork and LinkedIn. Disabled by default; they only read search and job pages through the
// ReadOnlyPage wrapper, with a page cap and 5–20 s random pauses.
import type { NormalizedOfferInput } from "@job-radar/core";
import { PageCapReachedError } from "../browser/guard";
import { SessionExpiredError, isLoginWall, type SiteDefinition } from "../browser/sessions";
import type { SourceAdapter, SourceContext } from "../types";
import { SITE_RULES, parseWithRule } from "./email";

interface LoggedInSite extends SiteDefinition {
  /** Search pages to read, built from the owner's keywords. */
  searchUrls(keywords: string[]): string[];
  rule: (typeof SITE_RULES)[number];
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
            const html = await page.html();
            if (isLoginWall(site, page.url(), html)) throw new SessionExpiredError(site.id);
            const found = parseSearchPage(site, html, page.url(), ctx.sourceId, ctx.now());
            ctx.log(`${new URL(url).pathname}: ${found.length} job links`);
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

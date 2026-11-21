import { describe, expect, it } from "vitest";
import { normalizedOfferSchema } from "@job-radar/core";
import {
  MYGREENHOUSE_SITE,
  MyGreenhouseNoDataError,
  applicationsFromResponses,
  myGreenhouseAdapter,
  myGreenhouseExternalId,
  offersFromRecommendations,
  offersFromSearch,
  portalStatusOf,
  type MyGreenhouseApplication,
} from "../src/adapters/mygreenhouse";
import { PageBudget, type CapturedResponse, type ReadOnlyPage } from "../src/browser/guard";
import {
  SessionExpiredError,
  type BrowserAccess,
  type SiteDefinition,
} from "../src/browser/sessions";
import { fixture, fixtureContext } from "./helpers";

interface Fixture {
  search: CapturedResponse[];
  dashboard: CapturedResponse[];
  applications: CapturedResponse[];
}
const data = () => JSON.parse(fixture("mygreenhouse.json")) as Fixture;

describe("MyGreenhouse mappers", () => {
  it("search: board ids, work type, via, and a description when the list has none", () => {
    const page = offersFromSearch(data().search);
    expect(page.gotList).toBe(true);
    expect(page.more).toBe(true);
    expect(page.offers.map((o) => o.externalId)).toEqual([
      "contosoai:4100000001",
      "fabrikam:5000000002",
      "tailspin:6000000003",
    ]);
    const [contoso, fabrikam, tailspin] = page.offers;
    expect(contoso).toMatchObject({
      title: "AI Software Engineer",
      companyName: "Contoso AI Team",
      remotePolicy: "remote",
      regions: ["Europe"],
      companyMeta: { via: "MyGreenhouse search" },
    });
    expect(contoso!.description).toMatch(/full description is on the job board/);
    expect(fabrikam!.remotePolicy).toBe("hybrid");
    expect(tailspin!.remotePolicy).toBe("onsite");
    for (const o of page.offers) expect(normalizedOfferSchema.safeParse(o).success).toBe(true);
  });

  it("recommendations: keeps Greenhouse's rank as metadata only", () => {
    const rec = offersFromRecommendations(data().dashboard);
    expect(rec.offers.map((o) => o.externalId)).toEqual([
      "woodgrove:4400000101",
      "contosoai:4100000001",
    ]);
    expect(rec.offers[0]).toMatchObject({
      companyMeta: { via: "MyGreenhouse recommended" },
      raw: { greenhouseRank: 1 },
    });
    expect(rec.offers[0]!.description).toMatch(/investment software/);
    expect(rec.offers[0]).not.toHaveProperty("score");
  });

  it("applications: statuses from inactive and stages, ids from the job link", () => {
    const read = applicationsFromResponses(data().applications);
    expect(read.gotList).toBe(true);
    expect(read.more).toBe(false);
    expect(
      read.applications.map((a: MyGreenhouseApplication) => [a.portalId, a.jobKey, a.status]),
    ).toEqual([
      ["100000001", "northwind:4300000001", "applied"],
      ["100000002", "northwind:4300000002", "Technical Interview"],
      ["100000003", "litware:4300000003", "inactive"],
    ]);
    expect(read.applications[0]!.appliedAt).toEqual(new Date("2026-11-21T13:48:32Z"));
  });

  it("status and id helpers", () => {
    expect(portalStatusOf({ inactive: false, stages: [] })).toBe("applied");
    expect(portalStatusOf({ inactive: true, stages: [{ name: "Offer" }] })).toBe("inactive");
    expect(portalStatusOf({ stages: ["Application Review", { title: "Onsite" }] })).toBe("Onsite");
    expect(myGreenhouseExternalId("https://boards.greenhouse.io/Acme/jobs/12", 12)).toBe("acme:12");
    expect(myGreenhouseExternalId("https://example.com/job", 12)).toBe("mygreenhouse:12");
    expect(myGreenhouseExternalId(null, null)).toBeNull();
  });
});

/** A browser whose pages answer with the fixture's responses, by path. */
function fakeBrowser(
  responses: (url: string) => CapturedResponse[],
  options: { finalUrl?: (url: string) => string; cap?: number } = {},
) {
  const visited: string[] = [];
  const clicks: string[] = [];
  const browser = {
    async withSite<T>(site: SiteDefinition, fn: (p: ReadOnlyPage) => Promise<T>): Promise<T> {
      let current = "";
      const budget = new PageBudget(options.cap ?? 20);
      const page: ReadOnlyPage = {
        async goto(url) {
          budget.take(site.id);
          visited.push(url);
          current = options.finalUrl?.(url) ?? url;
        },
        url: () => current,
        html: async () => "",
        waitFor: async () => false,
        scroll: async () => {},
        async safeClick(selector) {
          clicks.push(selector);
        },
        // Like the real guard: the pattern sees the path only, never the query string.
        jsonResponses: async (pattern) =>
          responses(current).filter((r) => pattern.test(r.url.split("?")[0] ?? r.url)),
        get pagesViewed() {
          return visited.length;
        },
      };
      return fn(page);
    },
  } as BrowserAccess;
  return { browser, visited, clicks };
}

const byPage = (url: string): CapturedResponse[] => {
  const d = data();
  if (url.endsWith("/applications")) return d.applications;
  if (url.endsWith("/dashboard")) return d.dashboard;
  if (url.includes("/jobs/search")) {
    const page2 = /[?&]page=2/.test(url);
    return d.search.map((r) => {
      const body = structuredClone(r.body) as {
        props: { moreResultsAvailable: boolean; jobPosts: unknown[] };
      };
      if (page2) {
        body.props.moreResultsAvailable = false;
        body.props.jobPosts = body.props.jobPosts.slice(0, 1);
      }
      return { ...r, url: new URL(url).pathname + new URL(url).search, body };
    });
  }
  return [];
};

const run = (browser: BrowserAccess, settings: Record<string, unknown> = {}) => {
  const reported: MyGreenhouseApplication[][] = [];
  const ctx = fixtureContext(
    {},
    {
      sourceId: "mygreenhouse",
      browser,
      settings: { settleMs: 0, queries: ["AI Engineer"], ...settings },
    },
  );
  ctx.reportApplications = (a) => reported.push(a);
  return { promise: myGreenhouseAdapter.fetchOffers(ctx), reported };
};

describe("MyGreenhouse adapter", () => {
  it("opens applications, dashboard and two search pages by URL, never clicking", async () => {
    const { browser, visited, clicks } = fakeBrowser(byPage);
    const { promise, reported } = run(browser);
    const offers = await promise;
    expect(visited).toEqual([
      "https://my.greenhouse.io/applications",
      "https://my.greenhouse.io/dashboard",
      "https://my.greenhouse.io/jobs/search?query=AI%20Engineer",
      "https://my.greenhouse.io/jobs/search?query=AI%20Engineer&page=2",
    ]);
    expect(clicks).toEqual([]);
    // Unique by id; applied jobs keep their applications origin.
    expect(offers.map((o) => o.externalId)).toEqual([
      "northwind:4300000001",
      "northwind:4300000002",
      "litware:4300000003",
      "woodgrove:4400000101",
      "contosoai:4100000001",
      "fabrikam:5000000002",
      "tailspin:6000000003",
    ]);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.map((a) => a.status)).toEqual([
      "applied",
      "Technical Interview",
      "inactive",
    ]);
    expect(myGreenhouseAdapter.requiresLogin).toBe(true);
    expect(MYGREENHOUSE_SITE.checkUrl).toBe("https://my.greenhouse.io/dashboard");
  });

  it("a sign-in page or a 401 means the session expired", async () => {
    const wall = fakeBrowser(byPage, { finalUrl: () => "https://my.greenhouse.io/users/sign_in" });
    await expect(run(wall.browser).promise).rejects.toBeInstanceOf(SessionExpiredError);
    const unauthorized = fakeBrowser(() => [
      { url: "/applications.json?page=1&active_only=true", status: 401, body: {} },
    ]);
    await expect(run(unauthorized.browser).promise).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("a page with no list fails with 'no ... arrived'", async () => {
    const empty = fakeBrowser(() => []);
    await expect(run(empty.browser).promise).rejects.toBeInstanceOf(MyGreenhouseNoDataError);
    const noSearch = fakeBrowser((url) => (url.includes("/jobs/search") ? [] : byPage(url)));
    await expect(run(noSearch.browser).promise).rejects.toThrow(/no job list arrived/);
  });

  it("stops at the page cap and keeps what it read", async () => {
    const { browser, visited } = fakeBrowser(byPage, { cap: 2 });
    const { promise, reported } = run(browser);
    const offers = await promise;
    expect(visited).toHaveLength(2);
    expect(offers.map((o) => o.externalId)).toContain("woodgrove:4400000101");
    expect(reported[0]).toHaveLength(3);
  });
});

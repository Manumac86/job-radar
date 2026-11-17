import { describe, expect, it } from "vitest";
import { PageBudget, PageCapReachedError, type ReadOnlyPage } from "../src/browser/guard";
import {
  SessionExpiredError,
  type BrowserAccess,
  type SiteDefinition,
} from "../src/browser/sessions";
import { loggedInAdapters } from "../src/adapters/logged-in";
import { assertNormalized, fixture, fixtureContext } from "./helpers";

/** A browser that serves saved HTML by URL substring, enforcing the same page cap. */
function fakeBrowser(
  pages: Record<string, string>,
  cap = 20,
): BrowserAccess & { visited: string[] } {
  const visited: string[] = [];
  const budget = new PageBudget(cap);
  return {
    visited,
    async withSite<T>(site: SiteDefinition, fn: (p: ReadOnlyPage) => Promise<T>): Promise<T> {
      let current = "";
      let viewed = 0;
      const page: ReadOnlyPage = {
        async goto(url) {
          budget.take(site.id);
          viewed++;
          visited.push(url);
          const key = Object.keys(pages).find((k) => url.includes(k));
          current = key === "LOGIN" ? site.loginUrl : url;
        },
        url: () => current,
        async html() {
          const key = Object.keys(pages).find(
            (k) => current.includes(k) || (k === "LOGIN" && current === site.loginUrl),
          );
          return key ? (pages[key] ?? "") : "<html></html>";
        },
        waitFor: async () => true,
        scroll: async () => {},
        safeClick: async () => {},
        get pagesViewed() {
          return viewed;
        },
      };
      return fn(page);
    },
  };
}

const adapter = (type: string) => loggedInAdapters.find((a) => a.type === type)!;
const lf = (name: string) => fixture(`logged-in/${name}`);

describe("logged-in adapters (saved HTML)", () => {
  it("are all opt-in, read-only and marked as requiring a login", () => {
    expect(loggedInAdapters.map((a) => a.type).sort()).toEqual([
      "linkedin",
      "malt",
      "mercor",
      "upwork",
      "wellfound",
    ]);
    expect(loggedInAdapters.every((a) => a.requiresLogin)).toBe(true);
  });

  it("LinkedIn: reads job cards from remote-only searches", async () => {
    const browser = fakeBrowser({ "linkedin.com/jobs/search": lf("linkedin-search.html") });
    const offers = await adapter("linkedin").fetchOffers(
      fixtureContext({}, { sourceId: "linkedin", browser }),
    );
    assertNormalized(offers);
    expect(browser.visited[0]).toMatch(/linkedin\.com\/jobs\/search\/\?keywords=.*&f_WT=2/);
    expect(browser.visited).toHaveLength(3); // three searches, never more than the cap
    const ids = [...new Set(offers.map((o) => o.externalId))];
    expect(ids).toEqual(["linkedin:4123456789", "linkedin:4198765432"]);
    expect(offers[0]).toMatchObject({
      title: "Senior AI Engineer",
      companyName: "Northwind Labs",
      remotePolicy: "remote",
    });
    expect(offers[0]!.sourceUrl).toBe("https://www.linkedin.com/jobs/view/4123456789");
  });

  it("Upwork: reads job tiles with budgets", async () => {
    const browser = fakeBrowser({ "upwork.com/nx/search/jobs": lf("upwork-search.html") });
    const offers = await adapter("upwork").fetchOffers(
      fixtureContext({}, { sourceId: "upwork", browser }),
    );
    assertNormalized(offers);
    expect(offers[0]).toMatchObject({
      externalId: "upwork:~021111222233334444",
      title: "Agentic RAG assistant for legal documents",
      engagementType: "freelance",
      compensation: { min: 7000, max: 11000, currency: "USD", period: "hour" },
    });
  });

  it("Malt, Wellfound and Mercor: read their project and job pages", async () => {
    const malt = await adapter("malt").fetchOffers(
      fixtureContext(
        {},
        {
          sourceId: "malt",
          browser: fakeBrowser({ "malt.es/dashboard": lf("malt-projects.html") }),
        },
      ),
    );
    expect(malt[0]).toMatchObject({
      title: "Lead developer GenAI platform",
      compensation: { min: 65_000, currency: "EUR", period: "day" },
    });
    const wf = await adapter("wellfound").fetchOffers(
      fixtureContext(
        {},
        {
          sourceId: "wellfound",
          browser: fakeBrowser({ "wellfound.com/jobs": lf("wellfound-jobs.html") }),
        },
      ),
    );
    expect(wf.map((o) => o.externalId)).toEqual(["wellfound:3456789", "wellfound:3456790"]);
    const mercor = await adapter("mercor").fetchOffers(
      fixtureContext(
        {},
        {
          sourceId: "mercor",
          browser: fakeBrowser({ "mercor.com/explore": lf("mercor-explore.html") }),
        },
      ),
    );
    expect(mercor[0]).toMatchObject({
      externalId: "mercor:lst_9f8e7d6c5b",
      title: "AI Evaluation Engineer (contract)",
    });
    for (const list of [malt, wf, mercor]) assertNormalized(list);
  });

  it("stops with 'session expired' on a login wall", async () => {
    const browser = fakeBrowser({ "linkedin.com/jobs/search": lf("login-wall.html") });
    await expect(
      adapter("linkedin").fetchOffers(fixtureContext({}, { sourceId: "linkedin", browser })),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("stops at the page cap and keeps what it already read", async () => {
    const browser = fakeBrowser({ "upwork.com/nx/search/jobs": lf("upwork-search.html") }, 1);
    const ctx = fixtureContext({}, { sourceId: "upwork", browser });
    const offers = await adapter("upwork").fetchOffers(ctx);
    expect(offers.length).toBe(2);
    expect(ctx.logs.some((l) => /Page cap reached for upwork/.test(l))).toBe(true);
    expect(new PageCapReachedError("x", 1).message).toMatch(/next window/);
  });

  it("refuses to run without the isolated browser", async () => {
    await expect(
      adapter("malt").fetchOffers(fixtureContext({}, { sourceId: "malt" })),
    ).rejects.toThrow(/isolated browser/);
  });
});

import { describe, expect, it } from "vitest";
import { normalizedOfferSchema } from "@job-radar/core";
import { parseCsv } from "../src/csv";
import {
  SimpleApplyCsvError,
  mapSimpleApplyMatch,
  parseSimpleApplyCsv,
  simpleApplyExternalId,
} from "../src/adapters/simpleapply";
import { PageBudget, type CapturedResponse, type ReadOnlyPage } from "../src/browser/guard";
import {
  SessionExpiredError,
  type BrowserAccess,
  type SiteDefinition,
} from "../src/browser/sessions";
import {
  SimpleApplyNoDataError,
  appliedAtOf,
  matchesFromDashboard,
  simpleApplyAdapter,
} from "../src/adapters/simpleapply";
import { fixtureContext } from "./helpers";
import { fixture } from "./helpers";

const NOW = new Date("2026-11-18T10:00:00Z");
const TZ = "Europe/Lisbon";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines in fields, CRLF and BOM", () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","line1\r\nline2"\r\n\r\n1,2,3';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line1\r\nline2"],
      ["1", "2", "3"],
    ]);
  });
});

describe("simpleApplyExternalId", () => {
  it("keeps host, path and id parameters only", () => {
    expect(
      simpleApplyExternalId(
        "https://WWW.Coinbase.com/careers/positions/8395582/?gh_jid=8395582&utm_source=x",
      ),
    ).toBe("simpleapply:coinbase.com/careers/positions/8395582?gh_jid=8395582");
    expect(simpleApplyExternalId("https://jobs.ashbyhq.com/acme/abc?utm_campaign=y")).toBe(
      simpleApplyExternalId("https://jobs.ashbyhq.com/acme/abc/"),
    );
    expect(simpleApplyExternalId("mailto:x@y.z")).toBeNull();
    expect(simpleApplyExternalId("not a url")).toBeNull();
  });
});

describe("parseSimpleApplyCsv", () => {
  it("maps rows to valid normalized offers and counts invalid ones", () => {
    const { matches, invalid } = parseSimpleApplyCsv(fixture("simpleapply-export.csv"), NOW, TZ);
    expect(invalid).toBe(2);
    expect(matches).toHaveLength(3);
    for (const m of matches)
      expect(normalizedOfferSchema.safeParse({ ...m.offer, sourceId: "simpleapply" }).success).toBe(
        true,
      );

    const [woodgrove, fabrikam, northwind] = matches;
    expect(woodgrove!.offer).toMatchObject({
      externalId: "simpleapply:job-boards.greenhouse.io/woodgrove/jobs/123?gh_jid=123",
      title: "Senior Software Engineer, Payments",
      companyName: "Woodgrove",
      remotePolicy: "remote",
      regions: ["US"],
      compensation: null,
      postedAt: new Date("2026-11-18T12:00:00Z"),
    });
    expect(woodgrove!.offer.description).toContain('5+ years of "backend" work');
    expect(woodgrove!.offer.raw).toMatchObject({ simpleapplyMatch: 95, via: "simpleapply csv" });
    expect(woodgrove!.appliedAt).toBeNull();

    expect(fabrikam!.appliedAt).toEqual(new Date("2026-11-17T12:00:00Z"));
    expect(fabrikam!.offer.regions).toEqual(expect.arrayContaining(["Europe", "Spain"]));
    expect(northwind!.offer.remotePolicy).toBe("hybrid");
  });

  it("rejects a file that is not a SimpleApply export, naming the missing columns", () => {
    expect(() => parseSimpleApplyCsv("Title,Company\nA,B\n", NOW, TZ)).toThrow(
      new SimpleApplyCsvError(
        "This is not a SimpleApply export: missing columns Job Title, Job URL",
      ),
    );
  });

  it("rejects files over 5 MB", () => {
    const big = "Job Title,Company,Job URL\n" + "x".repeat(5 * 1024 * 1024);
    expect(() => parseSimpleApplyCsv(big, NOW, TZ)).toThrow(/larger than 5 MB/);
  });
});

describe("mapSimpleApplyMatch", () => {
  it("treats an applied or interview status without a date as applied now, and converts salary to minor units", () => {
    const m = mapSimpleApplyMatch(
      {
        title: "Engineer",
        company: "Acme",
        url: "https://acme.test/jobs/1",
        status: "Interview",
        salary: { min: 140000, max: 180000, currency: "USD", period: "year" },
        via: "simpleapply dashboard",
      },
      NOW,
      TZ,
    );
    expect(m?.appliedAt).toEqual(NOW);
    expect(m?.offer.compensation).toEqual({
      min: 14_000_000,
      max: 18_000_000,
      currency: "USD",
      period: "year",
    });
  });
});

const dashboard = () =>
  JSON.parse(fixture("simpleapply-dashboard.json")) as { responses: CapturedResponse[] };

/** A dashboard that answers jsonResponses with the given pages (one per "Next page"). */
function fakeDashboard(pages: CapturedResponse[][], finalUrl = "https://simpleapply.ai/dashboard") {
  const visited: string[] = [];
  const clicks: string[] = [];
  const browser: BrowserAccess = {
    async withSite<T>(site: SiteDefinition, fn: (p: ReadOnlyPage) => Promise<T>): Promise<T> {
      let current = "";
      let index = 0;
      const budget = new PageBudget(20);
      const page: ReadOnlyPage = {
        async goto(url) {
          budget.take(site.id);
          visited.push(url);
          current = finalUrl;
        },
        url: () => current,
        html: async () => "",
        waitFor: async () => index < pages.length - 1,
        scroll: async () => {},
        async safeClick(selector) {
          clicks.push(selector);
          index++;
        },
        jsonResponses: async () => pages.slice(0, index + 1).flat(),
        get pagesViewed() {
          return visited.length;
        },
      };
      return fn(page);
    },
  } as BrowserAccess;
  return { browser, visited, clicks };
}

describe("SimpleApply dashboard", () => {
  it("maps list jobs, skips count-only calls and hidden jobs, and keeps no account data", () => {
    const matches = matchesFromDashboard(dashboard().responses, NOW, TZ);
    expect(matches.map((m) => m.offer.companyName)).toEqual(["Woodgrove", "Fabrikam", "Tailspin"]);
    const [woodgrove, fabrikam, tailspin] = matches;
    for (const m of matches)
      expect(normalizedOfferSchema.safeParse({ ...m.offer, sourceId: "simpleapply" }).success).toBe(
        true,
      );
    // Same id as the CSV row for the same job.
    expect(woodgrove!.offer).toMatchObject({
      externalId: "simpleapply:job-boards.greenhouse.io/woodgrove/jobs/123?gh_jid=123",
      compensation: { min: 14_000_000, max: 18_000_000, currency: "USD", period: "year" },
      engagementType: "full-time",
      skills: ["TypeScript", "Payments", "PostgreSQL"],
    });
    expect(woodgrove!.offer.description).toMatch(/Skills: TypeScript, Payments, PostgreSQL/);
    expect(fabrikam!.offer.engagementType).toBe("contract");
    expect(tailspin!.appliedAt).toEqual(new Date("2026-11-17T09:00:00.000Z"));
    expect(appliedAtOf(tailspin!.offer)).toEqual(new Date("2026-11-17T09:00:00.000Z"));
    expect(JSON.stringify(matches)).not.toMatch(/fixture-user|user_id/);
  });

  it("adapter: reads every page through Next page only, and never clicks anything else", async () => {
    const r = dashboard().responses;
    const second: CapturedResponse = {
      url: "/api/jobs?show_hidden=false&page=2&limit=25&status=not-applied",
      status: 200,
      body: {
        jobs: [
          {
            job_title: "Platform Engineer",
            company_name: "Northwind",
            job_url: "https://jobs.lever.co/northwind/2",
            workplace_type: "remote",
          },
        ],
      },
    };
    const { browser, visited, clicks } = fakeDashboard([r, [second]]);
    const offers = await simpleApplyAdapter.fetchOffers(
      fixtureContext({}, { sourceId: "simpleapply", browser, settings: { settleMs: 0 } }),
    );
    expect(visited).toEqual(["https://simpleapply.ai/dashboard"]);
    expect(clicks).toEqual(['button[aria-label="Next page"]:not([disabled])']);
    expect(offers.map((o) => o.companyName)).toEqual([
      "Woodgrove",
      "Fabrikam",
      "Tailspin",
      "Northwind",
    ]);
    expect(simpleApplyAdapter.requiresLogin).toBe(true);
  });

  it("adapter: a 401 or the /auth page means the session expired", async () => {
    const unauthorized = fakeDashboard([
      [{ url: "/api/jobs?page=1", status: 401, body: { message: "Unauthorized" } }],
    ]);
    await expect(
      simpleApplyAdapter.fetchOffers(
        fixtureContext(
          {},
          { sourceId: "simpleapply", browser: unauthorized.browser, settings: { settleMs: 0 } },
        ),
      ),
    ).rejects.toBeInstanceOf(SessionExpiredError);
    const auth = fakeDashboard([[]], "https://simpleapply.ai/auth");
    await expect(
      simpleApplyAdapter.fetchOffers(
        fixtureContext(
          {},
          { sourceId: "simpleapply", browser: auth.browser, settings: { settleMs: 0 } },
        ),
      ),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("adapter: no job list at all is reported, not read as zero matches", async () => {
    const { browser } = fakeDashboard([[]]);
    await expect(
      simpleApplyAdapter.fetchOffers(
        fixtureContext({}, { sourceId: "simpleapply", browser, settings: { settleMs: 0 } }),
      ),
    ).rejects.toBeInstanceOf(SimpleApplyNoDataError);
  });
});

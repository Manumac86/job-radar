import { describe, expect, it } from "vitest";
import {
  normalizeYc,
  parseListingHtml,
  readInertiaProps,
  ycombinatorAdapter,
  type YcPosting,
} from "../src/adapters/ycombinator";
import { assertNormalized, fixture, fixtureContext } from "./helpers";

describe("Y Combinator jobs", () => {
  it("reads postings from embedded data and enriches them from the job page", async () => {
    const ctx = fixtureContext(
      {
        "/jobs/role/software-engineer/remote": fixture("yc-listing.html"),
        "/companies/": fixture("yc-job.html"),
      },
      {
        sourceId: "ycombinator",
        settings: {
          roles: ["software-engineer", "full-stack"],
          title_keywords: ["CTO"],
          remote_only: true,
        },
      },
    );
    const offers = await ycombinatorAdapter.fetchOffers(ctx);
    assertNormalized(offers);
    // Five "Full stack" postings kept; the "Devops" one is dropped by the role filter.
    expect(offers).toHaveLength(5);
    const first = offers[0]!;
    expect(first).toMatchObject({
      externalId: "93346",
      companyName: "Pine Park Health",
      engagementType: "full-time",
      compensation: { min: 19_000_000, max: 21_500_000, currency: "USD", period: "year" },
    });
    expect(first.location).toContain("US citizen/visa only");
    expect(first.regions).toContain("US");
    expect(first.companyMeta).toMatchObject({ yc_batch: "S18", team_size: 75 });
    expect(first.description).toContain("About the Role");
    expect(first.description).toContain("Visa / location terms: US citizen/visa only");
    expect(ctx.urls[0]).toBe("https://www.ycombinator.com/jobs/role/software-engineer/remote");
  });

  it("stores 'Remote (US)' terms as stated so scoring can cap them", () => {
    const o = normalizeYc(
      {
        id: 1,
        title: "AI Engineer",
        url: "/companies/x/jobs/1-ai",
        companyName: "X",
        location: "Remote (US)",
        visa: "US citizen/visa only",
        equityRange: "0.5% - 1.0%",
      } as YcPosting,
      null,
    );
    expect(o).toMatchObject({
      remotePolicy: "remote",
      regions: ["US"],
      equityMin: 0.5,
      equityMax: 1,
      location: "Remote (US) · US citizen/visa only",
    });
  });

  it("falls back to HTML links when the embedded data is missing", () => {
    const html = '<a href="/companies/acme-ai/jobs/abc123-founding-engineer">Founding Engineer</a>';
    expect(readInertiaProps(html)).toBeNull();
    expect(parseListingHtml(html)).toMatchObject([
      { title: "Founding Engineer", companyName: "acme ai" },
    ]);
  });
});

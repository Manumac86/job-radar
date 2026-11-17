import { FakeLlmClient, LlmBudget, MemoryUsageStore } from "@job-radar/core";
import { describe, expect, it } from "vitest";
import {
  checkImportUrl,
  importOfferFromUrl,
  linkedInJobId,
  parseJsonLdJobPosting,
  parseLinkedInGuest,
  parseRelativeDate,
} from "../src/import-url";
import { assertNormalized, fixture, fixtureContext } from "./helpers";

const NOW = new Date("2026-11-16T12:00:00Z");

const JSON_LD_PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Staff AI Engineer",
  description: "<p>Build <b>agentic RAG</b> systems in TypeScript.</p>",
  datePosted: "2026-11-10",
  employmentType: "FULL_TIME",
  jobLocationType: "TELECOMMUTE",
  applicantLocationRequirements: { "@type": "Country", name: "Spain" },
  hiringOrganization: {
    "@type": "Organization",
    name: "Contoso",
    sameAs: "https://contoso.example",
  },
  baseSalary: { currency: "EUR", value: { minValue: 90000, maxValue: 120000, unitText: "YEAR" } },
  identifier: { value: "abc-123" },
})}</script></head><body>Apply</body></html>`;

describe("links", () => {
  it("finds the LinkedIn job id in the usual link shapes", () => {
    const id = (u: string) => linkedInJobId(new URL(u));
    expect(id("https://www.linkedin.com/jobs/view/4364680526/")).toBe("4364680526");
    expect(
      id("https://es.linkedin.com/jobs/view/senior-ai-engineer-at-futurice-4364680526?trk=x"),
    ).toBe("4364680526");
    expect(
      id("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4364680526"),
    ).toBe("4364680526");
    expect(id("https://example.com/jobs/view/4364680526")).toBeNull();
  });

  it("refuses local, private and non-http links", () => {
    for (const bad of [
      "http://localhost:4000/offers",
      "http://127.0.0.1:3300",
      "http://192.168.1.10/job",
      "http://10.0.0.5/job",
      "file:///etc/passwd",
      "not a url",
    ])
      expect(() => checkImportUrl(bad), bad).toThrow();
    expect(checkImportUrl("https://jobs.lever.co/acme/1").hostname).toBe("jobs.lever.co");
  });

  it("reads relative dates", () => {
    expect(parseRelativeDate("3 days ago", NOW)?.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(parseRelativeDate("1 week ago", NOW)?.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(parseRelativeDate("Reposted", NOW)).toBeNull();
  });
});

describe("parsers", () => {
  it("parses LinkedIn's public job page", () => {
    const o = parseLinkedInGuest(fixture("import/linkedin-guest.html"), "4364680526", NOW)!;
    assertNormalized([o]);
    expect(o).toMatchObject({
      externalId: "linkedin:4364680526",
      sourceUrl: "https://www.linkedin.com/jobs/view/4364680526/",
      title: "Senior AI Engineer",
      companyName: "Futurice",
      location: "Helsinki Metropolitan Area",
      engagementType: "full-time",
    });
    expect(o.postedAt?.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(o.description).toContain("Senior AI Engineer");
    expect(o.companyMeta).toMatchObject({ "Seniority level": "Mid-Senior level" });
  });

  it("parses schema.org JobPosting JSON-LD", () => {
    const o = parseJsonLdJobPosting(JSON_LD_PAGE, new URL("https://contoso.example/careers/1"))!;
    assertNormalized([o]);
    expect(o).toMatchObject({
      externalId: "url:contoso.example:abc-123",
      title: "Staff AI Engineer",
      companyName: "Contoso",
      remotePolicy: "remote",
      regions: ["Spain"],
      engagementType: "full-time",
      compensation: { min: 9_000_000, max: 12_000_000, currency: "EUR", period: "year" },
    });
    expect(o.description).toContain("Build agentic RAG systems");
  });
});

describe("importOfferFromUrl", () => {
  const llm = (response: unknown) => ({
    client: new FakeLlmClient([response]),
    budget: new LlmBudget(new MemoryUsageStore(), () => ({ scoring: 10, drafts: 10 })),
    model: "haiku",
  });

  it("uses LinkedIn's public endpoint, never the logged-in page", async () => {
    const ctx = fixtureContext({
      "jobs-guest/jobs/api/jobPosting/4364680526": fixture("import/linkedin-guest.html"),
    });
    const r = await importOfferFromUrl(
      "https://www.linkedin.com/jobs/view/senior-ai-engineer-at-futurice-4364680526",
      { fetcher: ctx.fetch, now: NOW },
    );
    expect(r.method).toBe("linkedin");
    expect(ctx.urls).toEqual([
      "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4364680526",
    ]);
  });

  it("falls back to the pasted text when the page cannot be read", async () => {
    const ctx = fixtureContext({});
    const model = llm({
      is_job_offer: true,
      title: "Freelance RAG developer",
      company: "Northwind",
      location: "Remote (EU)",
      remote_policy: "remote",
      engagement_type: "freelance",
      compensation_text: "€80/hour",
    });
    const pasted = "Northwind is hiring a freelance RAG developer. ".repeat(10);
    const r = await importOfferFromUrl("https://boards.example.com/jobs/77", {
      fetcher: ctx.fetch,
      llm: model,
      pastedText: pasted,
      now: NOW,
    });
    assertNormalized([r.offer]);
    expect(r).toMatchObject({
      method: "llm",
      offer: {
        title: "Freelance RAG developer",
        companyName: "Northwind",
        compensation: { min: 8000, currency: "EUR", period: "hour" },
      },
    });
    expect(model.client.requests[0]?.prompt).toContain("<untrusted");
  });

  it("asks for the text when the page is a login wall and nothing was pasted", async () => {
    const ctx = fixtureContext({ "boards.example.com": "<html><body>Sign in</body></html>" });
    await expect(
      importOfferFromUrl("https://boards.example.com/jobs/1", { fetcher: ctx.fetch, now: NOW }),
    ).rejects.toThrow(/Paste the offer text/);
  });
});

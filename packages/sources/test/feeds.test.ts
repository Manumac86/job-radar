import { FakeLlmClient } from "@job-radar/core";
import { describe, expect, it } from "vitest";
import { darwinAdapter } from "../src/adapters/darwin";
import { remoteOkAdapter, weWorkRemotelyAdapter } from "../src/adapters/feeds";
import { hnHiringAdapter, parseHnHeader } from "../src/adapters/hn";
import { assertNormalized, fixture, fixtureContext } from "./helpers";

describe("RemoteOK", () => {
  it("skips the legal notice and keeps remote offers with stated USD salary", async () => {
    const ctx = fixtureContext({ "remoteok.com/api": fixture("remoteok.json") });
    const offers = await remoteOkAdapter.fetchOffers(ctx);
    expect(offers).toHaveLength(7);
    assertNormalized(offers);
    expect(offers.every((o) => o.remotePolicy === "remote")).toBe(true);
    const paid = offers.find((o) => o.compensation);
    if (paid) expect(paid.compensation).toMatchObject({ currency: "USD", period: "year" });
    expect(offers[0]!.sourceUrl).toMatch(/^https:\/\/remoteok\.com\//i);
  });
});

describe("We Work Remotely", () => {
  it("splits 'Company: Role' titles and reads region and skills", async () => {
    const ctx = fixtureContext(
      { "remote-full-stack-programming-jobs.rss": fixture("wwr-full-stack.rss") },
      {
        settings: { categories: ["remote-full-stack-programming-jobs"] },
      },
    );
    const offers = await weWorkRemotelyAdapter.fetchOffers(ctx);
    expect(offers).toHaveLength(5);
    assertNormalized(offers);
    expect(offers[0]).toMatchObject({
      companyName: "Movement Labs",
      title: "Senior Data Engineers",
      location: "USA Only",
      engagementType: "full-time",
    });
    expect(offers[0]!.regions).toContain("US");
    expect(offers[0]!.skills).toContain("Python");
    expect(offers[0]!.description ?? "").not.toContain("&lt;");
  });
});

describe("Hacker News who is hiring", () => {
  it("parses pipe-separated headers", () => {
    expect(
      parseHnHeader(
        "Simple Analytics | DevOps Engineer | REMOTE (worldwide, any timezone) | Full-time | €5,000&#x2F;month<p>More",
      ),
    ).toMatchObject({
      company: "Simple Analytics",
      title: "DevOps Engineer",
      location: "REMOTE (worldwide, any timezone)",
    });
    expect(parseHnHeader("We are hiring lots of people, email me<p>details")).toBeNull();
  });

  it("reads the latest thread and uses the LLM only for unparseable posts that pass the filter", async () => {
    const llm = new FakeLlmClient([], () => ({
      is_job_post: true,
      company: "Mystery Co",
      title: "AI Engineer",
      location: "Remote",
      remote: true,
    }));
    const ctx = fixtureContext(
      { search_by_date: fixture("hn-search.json"), "items/": fixture("hn-thread.json") },
      { llm: { client: llm, model: "haiku" } },
    );
    const offers = await hnHiringAdapter.fetchOffers(ctx);
    assertNormalized(offers);
    expect(offers.length).toBeGreaterThan(25);
    const first = offers.find((o) => o.companyName === "Simple Analytics")!;
    expect(first).toMatchObject({
      title: "DevOps Engineer",
      remotePolicy: "remote",
      engagementType: "full-time",
    });
    expect(first.compensation).toEqual({
      min: 500_000,
      max: 500_000,
      currency: "EUR",
      period: "month",
    });
    expect(first.sourceUrl).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
    expect(ctx.logs.some((l) => /Who is hiring\? \(November 2026\)/.test(l))).toBe(true);
    // Every LLM call is an extraction (counted in the scoring cap) on untrusted text.
    for (const r of llm.requests) {
      expect(r.kind).toBe("extraction");
      expect(r.prompt).toMatch(/^<untrusted name="hn_comment">/);
    }
  });
});

describe("Darwin Recruitment", () => {
  it("reads the job feed: reference id, location, engagement, rate and remote policy", async () => {
    const ctx = fixtureContext({
      "darwinrecruitment.com/?feed=job_feed": fixture("darwin-feed.rss"),
    });
    const offers = await darwinAdapter.fetchOffers(ctx);
    assertNormalized(offers);
    expect(offers.map((o) => o.externalId)).toEqual([
      "1000000000001",
      "1000000000002",
      "1000000000003",
    ]);
    const [ai, platform, process] = offers;
    expect(ai).toMatchObject({
      title: "Senior AI Engineer (LLM Platform)",
      companyName: "Darwin Recruitment",
      location: "Remote Europe",
      remotePolicy: "remote",
      engagementType: "full-time",
      compensation: { max: 11_000_000, currency: "EUR", period: "year" },
      sourceUrl:
        "https://www.darwinrecruitment.com/job/1000000000001-senior-ai-engineer-llm-platform-remote/",
    });
    expect(ai!.description).toContain("retrieval-augmented");
    expect(platform).toMatchObject({
      remotePolicy: "hybrid",
      engagementType: "contract",
      compensation: { min: 9000, currency: "EUR", period: "hour" },
    });
    expect(process!.remotePolicy).toBe("hybrid");
    expect(ctx.logs).toContain("newest: 3 jobs");
  });

  it("runs one search per keyword and drops repeats", async () => {
    const ctx = fixtureContext(
      { "darwinrecruitment.com/?feed=job_feed": fixture("darwin-feed.rss") },
      { settings: { keywords: ["AI", "platform"] } },
    );
    const offers = await darwinAdapter.fetchOffers(ctx);
    expect(offers).toHaveLength(3);
    expect(ctx.logs).toEqual(expect.arrayContaining(["AI: 3 jobs", "platform: 3 jobs"]));
  });
});

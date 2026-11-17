import { FakeLlmClient, LlmBudget, MemoryUsageStore } from "@job-radar/core";
import { getApplicationForOffer, getOffer, listOffers, upsertSource } from "@job-radar/db";
import { createPoliteFetcher } from "@job-radar/sources";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importOffer } from "../src/ingest/import";
import { ingestOffers } from "../src/ingest/pipeline";
import { testContext } from "./helpers";

const NOW = new Date("2026-11-16T12:00:00Z");
const page = readFileSync(
  join(import.meta.dirname, "../../../packages/sources/test/fixtures/import/linkedin-guest.html"),
  "utf8",
);
const URL_ = "https://www.linkedin.com/jobs/view/4364680526/";

function fetcher(urls: string[] = []) {
  return createPoliteFetcher({
    minIntervalMs: 0,
    sleep: async () => {},
    fetchImpl: (async (input: string | URL | Request) => {
      urls.push(String(input));
      return String(input).includes("jobs-guest")
        ? new Response(page)
        : new Response("nope", { status: 404 });
    }) as typeof fetch,
  });
}

function ctx() {
  const c = testContext();
  return {
    ...c,
    llm: {
      client: new FakeLlmClient(),
      budget: new LlmBudget(new MemoryUsageStore(), () => ({ scoring: 10, drafts: 10 })),
    },
  };
}

describe("import an offer from a link", () => {
  it("stores it without the pre-filter and records the application", async () => {
    const c = ctx();
    const appliedAt = new Date("2026-11-14T11:00:00Z");
    const r = await importOffer(c, { url: URL_, appliedAt }, { fetcher: fetcher(), now: NOW });
    expect(r).toMatchObject({ existed: false, method: "linkedin" });
    const offer = getOffer(c.db, r.offerId)!;
    // Helsinki on-site-ish and outside the keywords: still kept, because the owner chose it.
    expect(offer).toMatchObject({
      sourceId: "manual",
      triage: "new",
      scoreStatus: "awaiting_score",
      companyName: "Futurice",
    });
    expect(getApplicationForOffer(c.db, r.offerId)?.appliedAt.toISOString()).toBe(
      appliedAt.toISOString(),
    );
  });

  it("finds an offer it already has, from another source, and does not duplicate it", async () => {
    const c = ctx();
    upsertSource(c.db, { id: "email_alerts", type: "email_alerts", name: "Email" });
    const counts = ingestOffers(
      c.db,
      "email_alerts",
      [
        {
          sourceId: "email_alerts",
          externalId: "linkedin:4364680526",
          sourceUrl: URL_,
          title: "Senior AI Engineer",
          companyName: "Futurice",
          description: "From an alert",
        },
      ],
      c.profile.get()!.preferences,
      NOW,
    );
    const first = await importOffer(c, { url: URL_ }, { fetcher: fetcher(), now: NOW });
    expect(first.existed).toBe(true);
    const again = await importOffer(c, { url: URL_ }, { fetcher: fetcher(), now: NOW });
    expect(again.offerId).toBe(first.offerId);
    expect(listOffers(c.db).total).toBe(1);
    if (counts.newOfferIds[0]) expect(first.offerId).toBe(counts.newOfferIds[0]);
  });

  it("only requests LinkedIn's public page", async () => {
    const urls: string[] = [];
    await importOffer(ctx(), { url: URL_ }, { fetcher: fetcher(urls), now: NOW });
    expect(urls).toEqual(["https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4364680526"]);
  });
});

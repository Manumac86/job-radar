import { describe, expect, it } from "vitest";
import { ashbyAdapter, greenhouseAdapter, leverAdapter } from "../src/adapters/ats";
import { assertNormalized, fixture, fixtureContext } from "./helpers";

describe("ATS adapters (recorded fixtures)", () => {
  it("Greenhouse: decodes escaped HTML and reads location and employment type", async () => {
    const ctx = fixtureContext({ "boards/tailscale/jobs": fixture("greenhouse-tailscale.json") });
    const offers = await greenhouseAdapter.fetchOffers({ ...ctx, sourceId: "greenhouse" });
    expect(offers).toHaveLength(3);
    assertNormalized(offers);
    const first = offers[0]!;
    expect(first.externalId).toMatch(/^tailscale:\d+$/);
    expect(first.companyName).toBe("Tailscale");
    expect(first.location).toBe("Remote (United States)");
    expect(first.remotePolicy).toBe("remote");
    expect(first.regions).toContain("US");
    expect(first.engagementType).toBe("full-time");
    expect(first.description ?? "").not.toMatch(/&lt;|<div/);
    expect((first.description ?? "").length).toBeGreaterThan(200);
    expect(first.postedAt).toBeInstanceOf(Date);
    expect(ctx.urls[0]).toContain("content=true");
  });

  it("Lever: builds description from lists and keeps all locations", async () => {
    const ctx = fixtureContext({ "postings/pigment": fixture("lever-pigment.json") });
    const offers = await leverAdapter.fetchOffers(ctx);
    expect(offers).toHaveLength(3);
    assertNormalized(offers);
    expect(offers[0]!.sourceUrl).toMatch(/^https:\/\/jobs\.lever\.co\/pigment\//);
    expect(offers[0]!.engagementType).toBe("full-time");
    expect(offers.every((o) => o.compensation === null)).toBe(true);
  });

  it("Ashby: reads salary and equity components", async () => {
    const ctx = fixtureContext({ "job-board/livekit": fixture("ashby-livekit.json") });
    const offers = await ashbyAdapter.fetchOffers(ctx);
    expect(offers).toHaveLength(3);
    assertNormalized(offers);
    const paid = offers.find((o) => o.compensation);
    expect(paid?.compensation).toEqual({
      min: 13_500_000,
      max: 30_000_000,
      currency: "USD",
      period: "year",
    });
    expect(offers[0]!.remotePolicy).toBe("remote");
    expect(ctx.urls[0]).toContain("includeCompensation=true");
  });

  it("keeps going when one board fails, and fails the run when all do", async () => {
    const ctx = fixtureContext({});
    await expect(ashbyAdapter.fetchOffers(ctx)).rejects.toThrow(/All 1 ashby boards failed/);
    expect(ctx.logs[0]).toMatch(/LiveKit: HTTP 404/);
  });
});

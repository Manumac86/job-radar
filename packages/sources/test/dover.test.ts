import type { NormalizedOfferInput } from "@job-radar/core";
import { describe, expect, it } from "vitest";
import { doverJobId, enrichDoverOffers, fetchDoverJob, needsDoverCompany } from "../src/dover";
import { fixture, fixtureContext } from "./helpers";

const JOB = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

const offer = (o: Partial<NormalizedOfferInput>): NormalizedOfferInput => ({
  sourceId: "simpleapply",
  externalId: `simpleapply:jobs.dover.com/company/${JOB}`,
  sourceUrl: `https://jobs.dover.com/company/${JOB}`,
  title: "Sr. Full-Stack Software Engineer, Remote",
  companyName: "Unknown company",
  description: "SimpleApply match (the full description is on the company site).",
  ...o,
});

describe("Dover job details (simpleapply-dover-fixes)", () => {
  it("reads the job id from Dover links only", () => {
    expect(doverJobId(`https://jobs.dover.com/company/${JOB}`)).toBe(JOB);
    expect(doverJobId(`https://app.dover.com/apply/contoso/${JOB.toUpperCase()}`)).toBe(JOB);
    expect(doverJobId(`https://boards.greenhouse.io/contoso/jobs/${JOB}`)).toBeNull();
    expect(doverJobId("https://jobs.dover.com/company/contoso")).toBeNull();
    expect(doverJobId("not a url")).toBeNull();
  });

  it("returns the company, its website and the plain-text description", async () => {
    const ctx = fixtureContext({ [`application-portal-job/${JOB}`]: fixture("dover-job.json") });
    const job = await fetchDoverJob(ctx.fetch, JOB);
    expect(job).toMatchObject({
      companyName: "Contoso Staffing",
      companyWebsite: "https://contoso.example",
    });
    expect(job.description).toContain("Global, fully remote");
    expect(job.description).toContain("- TypeScript");
    expect(job.description).not.toContain("<");
  });

  it("enriches only the offers that need it, and survives a missing job", async () => {
    const ctx = fixtureContext({ [`application-portal-job/${JOB}`]: fixture("dover-job.json") });
    const known = offer({
      externalId: "simpleapply:jobs.dover.com/company/known",
      sourceUrl: `https://jobs.dover.com/company/${OTHER.replace("9999", "7777")}`,
      companyName: "Fabrikam",
    });
    const missing = offer({
      externalId: `simpleapply:jobs.dover.com/company/${OTHER}`,
      sourceUrl: `https://jobs.dover.com/company/${OTHER}`,
    });
    const notDover = offer({ sourceUrl: "https://boards.greenhouse.io/x/jobs/1", externalId: "g" });
    const out = await enrichDoverOffers(
      [offer({}), known, missing, notDover],
      ctx.fetch,
      (o) => needsDoverCompany(o.companyName),
      ctx.log,
    );
    expect(out[0]).toMatchObject({
      companyName: "Contoso Staffing",
      companyWebsite: "https://contoso.example",
    });
    expect(out[0]!.description).toContain("Contract (~15 hours per week)");
    expect(out[1]).toBe(known);
    expect(out[2]).toBe(missing);
    expect(out[3]).toBe(notDover);
    expect(ctx.urls).toHaveLength(2);
    expect(ctx.logs).toContain("Dover: 1 of 2 companies resolved");
  });

  it("stops looking up for the run when Dover fails, without throwing", async () => {
    const ctx = fixtureContext({
      "application-portal-job/": () => new Response("down", { status: 503 }),
    });
    const second = offer({
      externalId: "b",
      sourceUrl: `https://jobs.dover.com/company/${OTHER}`,
    });
    const out = await enrichDoverOffers([offer({}), second], ctx.fetch, () => true, ctx.log);
    expect(out.map((o) => o.companyName)).toEqual(["Unknown company", "Unknown company"]);
    // One job with its retries, and no lookup for the second.
    expect(ctx.urls.every((u) => u.includes(JOB))).toBe(true);
    expect(ctx.logs.some((l) => l.includes("skipping lookups this run"))).toBe(true);
  });

  it("respects the per-run limit", async () => {
    const ctx = fixtureContext({ "application-portal-job/": fixture("dover-job.json") });
    await enrichDoverOffers(
      [offer({}), offer({ externalId: "b" })],
      ctx.fetch,
      () => true,
      ctx.log,
      1,
    );
    expect(ctx.urls).toHaveLength(1);
  });
});

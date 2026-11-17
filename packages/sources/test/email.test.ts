import { FakeLlmClient } from "@job-radar/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeImapError,
  emailAlertsAdapter,
  emailFromSource,
  parseAlertEmail,
} from "../src/adapters/email";
import { assertNormalized, fixtureContext } from "./helpers";

const eml = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", "email", `${name}.eml`));

async function parse(name: string, llm?: FakeLlmClient) {
  const ctx = fixtureContext(
    {},
    { sourceId: "email_alerts", llm: llm ? { client: llm, model: "haiku" } : undefined },
  );
  const offers = await parseAlertEmail(await emailFromSource(eml(name)), ctx);
  assertNormalized(offers);
  return { offers, ctx };
}

describe("job-alert email parsers (.eml fixtures)", () => {
  it("LinkedIn: one offer per job id with title, company and location", async () => {
    const { offers } = await parse("linkedin");
    expect(offers.map((o) => [o.externalId, o.title, o.companyName, o.location])).toEqual([
      [
        "linkedin:4012345678",
        "Senior AI Engineer (LLM, RAG)",
        "Northwind Analytics",
        "European Union (Remote)",
      ],
      [
        "linkedin:4087654321",
        "Head of Engineering",
        "Contoso Labs",
        "Madrid, Community of Madrid, Spain (Hybrid)",
      ],
    ]);
    expect(offers[0]!.sourceUrl).toBe("https://www.linkedin.com/comm/jobs/view/4012345678");
    expect(offers[1]!.remotePolicy).toBe("hybrid");
  });

  it("Upwork: plain-text alerts with hourly and fixed budgets", async () => {
    const { offers } = await parse("upwork");
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: "upwork:~021234567890abcdef",
      title: "Build agentic RAG assistant for legal documents",
      engagementType: "freelance",
      compensation: { min: 6000, max: 9000, currency: "USD", period: "hour" },
    });
    expect(offers[1]!.compensation).toMatchObject({
      min: 400_000,
      currency: "USD",
      period: "project",
    });
  });

  it("Malt: day rate in EUR", async () => {
    const { offers } = await parse("malt");
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      title: "Lead developer IA generativa (RAG)",
      companyName: "Fabrikam Seguros",
      remotePolicy: "remote",
      engagementType: "freelance",
      compensation: { min: 60_000, currency: "EUR", period: "day" },
    });
  });

  it("Wellfound: startup job with salary", async () => {
    const { offers } = await parse("wellfound");
    expect(offers[0]).toMatchObject({
      externalId: "wellfound:3456789",
      title: "Founding Full-Stack Engineer",
      companyName: "Tailspin AI",
      regions: ["Europe"],
      compensation: { min: 7_000_000, max: 9_500_000, currency: "EUR" },
    });
  });

  it("unknown sender: LLM fallback keeps only URLs present in the email", async () => {
    const llm = new FakeLlmClient([
      {
        jobs: [
          {
            title: "Staff TypeScript Engineer",
            company: "Adatum",
            location: "Remote EU",
            url: "https://jobs.example.invalid/adatum/123",
          },
          {
            title: "Invented job",
            company: "Nowhere",
            location: null,
            url: "https://evil.example.invalid/phish",
          },
        ],
      },
    ]);
    const { offers, ctx } = await parse("unknown", llm);
    expect(offers.map((o) => o.title)).toEqual(["Staff TypeScript Engineer"]);
    expect(llm.requests[0]?.kind).toBe("extraction");
    expect(llm.requests[0]?.prompt).toContain('<untrusted name="email">');
    expect(ctx.logs[0]).toMatch(/No parser match .* using LLM extraction/);
  });

  it("refuses to run without a mailbox address and app password", async () => {
    const ctx = fixtureContext({}, { readSecret: () => null });
    await expect(emailAlertsAdapter.fetchOffers(ctx)).rejects.toThrow(/secrets\/imap_app_password/);
  });
});

describe("describeImapError", () => {
  it("explains a missing Gmail label", () => {
    const err = describeImapError(
      { message: "Command failed", serverResponseCode: "NONEXISTENT" },
      "job-alerts",
    );
    expect(err.message).toMatch(/no label "job-alerts"/);
  });
  it("explains a rejected login", () => {
    expect(describeImapError({ authenticationFailed: true }, "x").message).toMatch(
      /rejected the login/,
    );
  });
  it("keeps the server response otherwise", () => {
    expect(
      describeImapError({ serverResponseCode: "LIMIT", responseText: "Too many" }, "x").message,
    ).toBe("IMAP error: LIMIT Too many");
  });
});

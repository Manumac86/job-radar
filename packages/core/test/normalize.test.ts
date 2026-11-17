import { describe, expect, it } from "vitest";
import {
  normalizeCompany,
  normalizeTitle,
  parseCompensation,
  prefilter,
  stripHtml,
} from "../src/index";

const keywords = {
  include: ["TypeScript", "Next.js", "RAG", "AI engineer", "CTO"],
  exclude: ["WordPress", "security clearance", "title:junior", "on-site only"],
};

describe("normalization", () => {
  it("matches the same company and role across sources", () => {
    expect(normalizeCompany("Acme.ai, Inc.")).toBe(normalizeCompany("ACME AI"));
    expect(normalizeCompany("Señal Labs S.L.")).toBe("senal labs");
    expect(normalizeTitle("Sr. AI Engineer (Remote, EU)")).toBe(
      normalizeTitle("Senior AI Engineer – Remote"),
    );
    expect(normalizeTitle("Full-Stack Engineer [m/f/d]")).toBe("full stack engineer");
  });

  it("strips HTML", () => {
    expect(stripHtml("<p>Hello&nbsp;<b>world</b></p><ul><li>One</li></ul>")).toBe(
      "Hello world\n- One",
    );
  });
});

describe("prefilter", () => {
  it("excludes an offer matching an exclude keyword and records it", () => {
    const r = prefilter(
      { title: "Senior PHP Developer", description: "WordPress plugins and TypeScript" },
      keywords,
    );
    expect(r).toEqual({
      pass: false,
      keyword: "WordPress",
      reason: 'Excluded keyword "WordPress"',
    });
  });

  it("applies title-only exclusions to the title alone", () => {
    expect(prefilter({ title: "Junior Frontend Dev", description: "Next.js" }, keywords).pass).toBe(
      false,
    );
    expect(
      prefilter(
        { title: "Staff Engineer", description: "Mentor junior engineers; Next.js" },
        keywords,
      ).pass,
    ).toBe(true);
  });

  it("requires at least one include keyword, with word edges", () => {
    expect(prefilter({ title: "Data Analyst", description: "Excel" }, keywords)).toMatchObject({
      pass: false,
      reason: "No include keyword matched",
    });
    expect(prefilter({ title: "Engineer", description: "We use Next.js" }, keywords)).toMatchObject(
      {
        pass: true,
        matchedInclude: ["Next.js"],
      },
    );
    // "RAG" must not match "storage" or "leverage".
    expect(prefilter({ title: "Engineer", description: "leverage storage" }, keywords).pass).toBe(
      false,
    );
    expect(prefilter({ title: "Fractional CTO", description: "" }, keywords).pass).toBe(true);
  });
});

describe("compensation parsing", () => {
  it("parses stated ranges and never guesses missing ones", () => {
    expect(parseCompensation("$120k – $160k")).toEqual({
      min: 12_000_000,
      max: 16_000_000,
      currency: "USD",
      period: "year",
    });
    expect(parseCompensation("€80/h")).toEqual({
      min: 8_000,
      max: 8_000,
      currency: "EUR",
      period: "hour",
    });
    expect(parseCompensation("Day rate 550 EUR per day")).toEqual({
      min: 55_000,
      max: 55_000,
      currency: "EUR",
      period: "day",
    });
    expect(parseCompensation("Competitive salary")).toBeNull();
    expect(parseCompensation("5+ years of experience")).toBeNull();
  });
});

describe("title gate", () => {
  it("drops non-engineering titles even when the description mentions AI", () => {
    const kw = { ...keywords, title_include: ["engineer", "CTO", "AI"] };
    expect(
      prefilter(
        {
          title: "Enterprise Account Executive",
          description: "Sell our AI platform to TypeScript teams",
        },
        kw,
      ),
    ).toEqual({
      pass: false,
      keyword: null,
      reason: "Title is not a target role",
    });
    expect(prefilter({ title: "Fractional CTO", description: "Next.js" }, kw).pass).toBe(true);
    expect(prefilter({ title: "AI Deployment Strategist", description: "RAG" }, kw).pass).toBe(
      true,
    );
  });
});

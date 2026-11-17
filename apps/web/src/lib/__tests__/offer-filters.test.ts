import { describe, expect, it } from "vitest";
import { parseOfferFilters } from "../offer-filters";

describe("parseOfferFilters", () => {
  it("defaults to open offers sorted by score descending", () => {
    expect(parseOfferFilters({})).toMatchObject({
      triage: ["new", "shortlisted"],
      sort: "score",
      direction: "desc",
      page: 1,
      offset: 0,
    });
  });
  it("maps URL params to query filters", () => {
    const f = parseOfferFilters({
      class: "strong",
      engagement: "contract",
      minRate: "70",
      sort: "posted",
      dir: "asc",
      page: "3",
      q: " rag ",
    });
    expect(f).toMatchObject({
      scoreClass: ["strong"],
      engagementType: ["contract"],
      minRate: 7000,
      sort: "posted",
      direction: "asc",
      offset: 100,
      search: " rag ",
    });
  });
  it("ignores unknown sort keys", () => {
    expect(parseOfferFilters({ sort: "drop table" }).sort).toBe("score");
  });

  it("hides applied offers unless 'Show applied' is on", () => {
    expect(parseOfferFilters({}).applied).toBe("exclude");
    expect(parseOfferFilters({ applied: "0" }).applied).toBe("exclude");
    expect(parseOfferFilters({ applied: "1" }).applied).toBe("include");
  });
});

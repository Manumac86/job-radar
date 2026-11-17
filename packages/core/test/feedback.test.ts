import { describe, expect, it } from "vitest";
import { cleanDismissReasons, learnableByDefault, summarizeDismissal } from "../src/offers/types";

describe("dismiss reasons", () => {
  it("summarizes reasons in list order with the note", () => {
    expect(summarizeDismissal(["location", "contract"], "  US W2   only ")).toBe(
      "Location or time zone, Contract type — US W2 only",
    );
  });

  it("keeps a note alone and returns null when empty", () => {
    expect(summarizeDismissal([], "not now")).toBe("not now");
    expect(summarizeDismissal([], " ")).toBeNull();
    expect(summarizeDismissal(["bogus"], null)).toBeNull();
  });

  it("drops unknown and repeated ids", () => {
    expect(cleanDismissReasons(["other", "salary", "x", "salary"])).toEqual(["salary", "other"]);
  });

  it("does not learn from a duplicate-only dismissal by default", () => {
    expect(learnableByDefault(["duplicate"])).toBe(false);
    expect(learnableByDefault(["duplicate", "salary"])).toBe(true);
    expect(learnableByDefault([])).toBe(true);
  });
});

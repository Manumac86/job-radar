import { describe, expect, it } from "vitest";
import { backToOffersHref, offerHref } from "../back-link";

describe("Back to offers (job-dashboard spec)", () => {
  it("carries the list's query to the offer, and only when there is one", () => {
    expect(offerHref(7, "class=strong&engagement=contract")).toBe(
      "/offers/7?list=class%3Dstrong%26engagement%3Dcontract",
    );
    expect(offerHref(7, "")).toBe("/offers/7");
  });

  it("returns to the list with that query, or to the default list", () => {
    expect(backToOffersHref("class=strong&engagement=contract")).toBe(
      "/offers?class=strong&engagement=contract",
    );
    expect(backToOffersHref(undefined)).toBe("/offers");
    expect(backToOffersHref("")).toBe("/offers");
    expect(backToOffersHref(["a=1", "b=2"])).toBe("/offers");
  });

  it("always stays on /offers, whatever the query holds", () => {
    expect(backToOffersHref("//evil.example/x")).toBe("/offers?%2F%2Fevil.example%2Fx=");
    expect(backToOffersHref("https://evil.example")).toMatch(/^\/offers\?/);
  });
});

import { describe, expect, it } from "vitest";
import { createApplication, setTriage, skyOffers } from "../src/index";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const NOW = new Date("2026-11-23T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("skyOffers (dashboard star field)", () => {
  it("returns open, scored offers of the period, newest first, with shortlisting", () => {
    const db = memoryDb();
    seedSource(db);
    const scored = (
      title: string,
      score: number,
      cls: "strong" | "possible" | "weak",
      seen: Date,
    ) =>
      seedOffer(db, {
        title,
        normalizedTitle: title.toLowerCase(),
        score,
        scoreClass: cls,
        firstSeenAt: seen,
      });
    const a = scored("A", 91, "strong", daysAgo(1));
    const b = scored("B", 65, "possible", daysAgo(3));
    scored("Old", 88, "strong", daysAgo(40));
    seedOffer(db, { title: "Unscored", normalizedTitle: "unscored", firstSeenAt: daysAgo(1) });
    const applied = scored("Applied", 80, "strong", daysAgo(2));
    createApplication(db, { offerId: applied.id, at: NOW });
    const dismissed = scored("Dismissed", 70, "possible", daysAgo(2));
    setTriage(db, dismissed.id, "dismissed");
    setTriage(db, b.id, "shortlisted");

    const sky = skyOffers(db, { days: 30, now: NOW });
    expect(sky.map((o) => o.title)).toEqual(["A", "B"]);
    expect(sky[0]).toMatchObject({ id: a.id, score: 91, scoreClass: "strong", shortlisted: false });
    expect(sky[1]).toMatchObject({ shortlisted: true });
  });
});

import { describe, expect, it } from "vitest";
import { createApplication, moveStage } from "../src/queries/applications";
import { listOffers } from "../src/queries/offers";
import { memoryDb, seedOffer, seedSource } from "./helpers";

function setup() {
  const db = memoryDb();
  seedSource(db);
  const open = seedOffer(db, { title: "Senior AI Engineer", engagementType: "contract" });
  const applied = seedOffer(db, { title: "Staff AI Engineer", engagementType: "contract" });
  const other = seedOffer(db, { title: "PHP Maintainer", engagementType: "full-time" });
  const app = createApplication(db, { offerId: applied.id });
  moveStage(db, app.id, "technical_interview");
  return { db, open, applied, other };
}

describe("offers list and applications", () => {
  it("includes applied offers with their pipeline stage by default", () => {
    const { db, open, applied } = setup();
    const res = listOffers(db, { sort: "title", direction: "asc" });
    expect(res.total).toBe(3);
    expect(res.appliedHidden).toBe(0);
    const byId = new Map(res.rows.map((r) => [r.id, r.applicationStage]));
    expect(byId.get(applied.id)).toBe("technical_interview");
    expect(byId.get(open.id)).toBeNull();
  });

  it("leaves applied offers out of rows and total when excluded, and counts them", () => {
    const { db, applied } = setup();
    const res = listOffers(db, { applied: "exclude" });
    expect(res.rows.map((r) => r.id)).not.toContain(applied.id);
    expect(res.total).toBe(2);
    expect(res.appliedHidden).toBe(1);
  });

  it("combines with the other filters and pagination", () => {
    const { db, open } = setup();
    const contract = listOffers(db, { applied: "exclude", engagementType: ["contract"] });
    expect(contract.rows.map((r) => r.id)).toEqual([open.id]);
    expect(contract).toMatchObject({ total: 1, appliedHidden: 1 });
    const fullTime = listOffers(db, { applied: "exclude", engagementType: ["full-time"] });
    expect(fullTime).toMatchObject({ total: 1, appliedHidden: 0 });
    const page2 = listOffers(db, { applied: "include", limit: 2, offset: 2 });
    expect(page2.rows).toHaveLength(1);
    expect(page2.total).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { createApplication } from "../src/queries/applications";
import { applyCompanyExclusions, getOffer } from "../src/queries/offers";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const reason = (c: string) => `Excluded company "${c}"`;

describe("applyCompanyExclusions", () => {
  it("hides open offers, keeps applied ones, and restores when un-excluded", () => {
    const db = memoryDb();
    seedSource(db);
    const open = seedOffer(db);
    const applied = seedOffer(db);
    createApplication(db, { offerId: applied.id, sentDraftId: null });
    const keywordFiltered = seedOffer(db, { triage: "filtered", triageReason: "Excluded keyword" });

    const hide = (name: string) => (name === "Acme AI" ? "Acme AI" : null);
    expect(applyCompanyExclusions(db, hide, reason)).toEqual({ hidden: 1, restored: 0 });
    expect(getOffer(db, open.id)?.triage).toBe("filtered");
    expect(getOffer(db, applied.id)?.triage).not.toBe("filtered");

    expect(applyCompanyExclusions(db, () => null, reason)).toEqual({ hidden: 0, restored: 1 });
    expect(getOffer(db, open.id)?.triage).toBe("new");
    expect(getOffer(db, keywordFiltered.id)?.triage).toBe("filtered");
  });

  it("queues never-scored offers for scoring when restored", () => {
    const db = memoryDb();
    seedSource(db);
    const o = seedOffer(db, {
      triage: "filtered",
      triageReason: reason("Acme AI"),
      scoreStatus: "not_scored",
    });
    applyCompanyExclusions(db, () => null, reason);
    expect(getOffer(db, o.id)?.scoreStatus).toBe("awaiting_score");
  });
});

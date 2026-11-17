import { describe, expect, it } from "vitest";
import { createApplication } from "../src/queries/applications";
import { setTriage } from "../src/queries/offers";
import {
  activeCompanyResearch,
  currentCompanyResearch,
  deferCompanyResearch,
  dueCompanyResearch,
  failCompanyResearch,
  finishCompanyResearch,
  isResearchFresh,
  latestCompanyResearch,
  openOfferIdsForCompany,
  requestCompanyResearch,
  resetInterruptedResearch,
  startCompanyResearch,
} from "../src/queries/research";
import { memoryDb, seedOffer, seedSource } from "./helpers";

const T0 = new Date("2026-11-01T10:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 864e5);

function setup() {
  const db = memoryDb();
  seedSource(db);
  const offer = seedOffer(db);
  return { db, offer, companyId: offer.companyId! };
}

describe("company research rows", () => {
  it("dedupes active rows, reuses fresh profiles for 30 days and allows a forced refresh", () => {
    const { db, companyId, offer } = setup();
    const first = requestCompanyResearch(db, {
      companyId,
      offerId: offer.id,
      reason: "manual",
      now: T0,
    });
    expect(first.kind).toBe("queued");
    expect(requestCompanyResearch(db, { companyId, reason: "shortlist", now: T0 }).kind).toBe(
      "active",
    );

    startCompanyResearch(db, first.row.id, T0);
    expect(activeCompanyResearch(db, companyId)?.status).toBe("running");
    finishCompanyResearch(db, first.row.id, {
      status: "done",
      profile: { product: null },
      readUrls: ["https://acme.example"],
      model: "sonnet",
      meta: { pagesRead: 1 },
      now: T0,
    });
    const done = currentCompanyResearch(db, companyId);
    expect(isResearchFresh(done, days(10))).toBe(true);
    expect(isResearchFresh(done, days(31))).toBe(false);
    expect(requestCompanyResearch(db, { companyId, reason: "strong", now: days(10) }).kind).toBe(
      "fresh",
    );
    expect(requestCompanyResearch(db, { companyId, reason: "strong", now: days(31) }).kind).toBe(
      "queued",
    );
  });

  it("keeps the previous profile current while a refresh fails", () => {
    const { db, companyId } = setup();
    const a = requestCompanyResearch(db, { companyId, reason: "manual", now: T0 });
    finishCompanyResearch(db, a.row.id, {
      status: "partial",
      profile: {},
      readUrls: [],
      model: "m",
      meta: {},
      now: T0,
    });
    const b = requestCompanyResearch(db, {
      companyId,
      reason: "manual",
      force: true,
      now: days(1),
    });
    failCompanyResearch(db, b.row.id, "Claude Code CLI not logged in", days(1));
    expect(currentCompanyResearch(db, companyId)?.id).toBe(a.row.id);
    expect(latestCompanyResearch(db, companyId)).toMatchObject({
      status: "failed",
      error: "Claude Code CLI not logged in",
    });
  });

  it("defers capped research until the next day and recovers interrupted runs", () => {
    const { db, companyId } = setup();
    const r = requestCompanyResearch(db, { companyId, reason: "shortlist", now: T0 });
    startCompanyResearch(db, r.row.id, T0);
    deferCompanyResearch(db, r.row.id, days(1), "Research queued: daily limit reached");
    expect(dueCompanyResearch(db, T0)).toEqual([]);
    expect(dueCompanyResearch(db, days(1)).map((x) => x.id)).toEqual([r.row.id]);
    startCompanyResearch(db, r.row.id, days(1));
    expect(resetInterruptedResearch(db)).toBe(1);
    expect(activeCompanyResearch(db, companyId)?.status).toBe("queued");
  });

  it("lists the company's open offers only", () => {
    const { db, companyId, offer } = setup();
    const dismissed = seedOffer(db);
    const applied = seedOffer(db);
    setTriage(db, dismissed.id, "dismissed");
    createApplication(db, { offerId: applied.id });
    expect(openOfferIdsForCompany(db, companyId)).toEqual([offer.id]);
  });
});

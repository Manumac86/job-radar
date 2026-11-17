import { describe, expect, it } from "vitest";
import {
  addInterview,
  createApplication,
  dashboardMetrics,
  hasAnyOffers,
  insertOffer,
  moveStage,
  recordScore,
  setNextStep,
  setTriage,
  upsertCompany,
  upsertEngagement,
  upsertSource,
} from "../src/index";
import { memoryDb } from "./helpers";

const NOW = new Date("2026-11-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function seed() {
  const db = memoryDb();
  upsertSource(db, { id: "ashby", type: "ashby", name: "Ashby" });
  upsertSource(db, { id: "email_alerts", type: "email_alerts", name: "Email" });
  let n = 0;
  const offer = (source: string, seen: Date, cls?: "strong" | "possible" | "weak") => {
    const c = upsertCompany(db, { name: `C${n}`, normalizedName: `c${n}` });
    const o = insertOffer(db, {
      sourceId: source,
      externalId: String(n++),
      sourceUrl: "https://x.invalid",
      title: "AI Engineer",
      normalizedTitle: "ai engineer",
      companyId: c.id,
      companyName: c.name,
      firstSeenAt: seen,
    });
    if (cls) {
      recordScore(db, {
        offerId: o.id,
        overall: cls === "strong" ? 85 : cls === "possible" ? 65 : 30,
        modelOverall: 85,
        skillsFit: 80,
        seniorityFit: 80,
        rateFit: 80,
        locationFit: 80,
        engagementFit: 80,
        scoreClass: cls,
        rationale: "r",
        model: "haiku",
      });
    }
    return o;
  };
  return { db, offer };
}

describe("dashboard metrics", () => {
  it("is empty when no offers exist", () => {
    const { db } = seed();
    expect(hasAnyOffers(db)).toBe(false);
    expect(dashboardMetrics(db, { days: 30, now: NOW }).totals.offers).toBe(0);
  });

  it("counts offers per day by source and by score class within the period", () => {
    const { db, offer } = seed();
    offer("ashby", daysAgo(1), "strong");
    offer("ashby", daysAgo(1), "weak");
    offer("email_alerts", daysAgo(2), "possible");
    offer("ashby", daysAgo(40), "strong"); // outside 30 days
    const m = dashboardMetrics(db, { days: 30, now: NOW });
    expect(m.totals).toMatchObject({ offers: 3, strong: 1, possible: 1, weak: 1 });
    expect(m.ingestedPerDay).toEqual([
      { day: "2026-11-13", sourceId: "email_alerts", count: 1 },
      { day: "2026-11-14", sourceId: "ashby", count: 2 },
    ]);
    expect(dashboardMetrics(db, { days: 90, now: NOW }).totals.offers).toBe(4);
  });

  it("computes the funnel and response rate per source only from applications created in the window", () => {
    const { db, offer } = seed();
    const a = offer("ashby", daysAgo(20), "strong");
    const b = offer("ashby", daysAgo(20), "strong");
    const c = offer("email_alerts", daysAgo(20), "possible");
    const old = offer("ashby", daysAgo(80), "strong");
    setTriage(db, b.id, "shortlisted");
    const appA = createApplication(db, { offerId: a.id, at: daysAgo(10) });
    createApplication(db, { offerId: b.id, at: daysAgo(10) });
    createApplication(db, { offerId: c.id, at: daysAgo(9) });
    const appOld = createApplication(db, { offerId: old.id, at: daysAgo(60) });
    moveStage(db, appA.id, "screening_call", { at: daysAgo(6) });
    moveStage(db, appA.id, "technical_interview", { at: daysAgo(4) });
    moveStage(db, appOld.id, "screening_call", { at: daysAgo(50) });

    const m = dashboardMetrics(db, { days: 30, now: NOW });
    expect(m.totals.applied).toBe(3);
    expect(m.totals.shortlisted).toBe(1);
    const ashby = m.funnel.find((f) => f.sourceId === "ashby")!;
    expect(ashby.total).toBe(2);
    expect(ashby.reached).toMatchObject({
      applied: 2,
      screening_call: 1,
      technical_interview: 1,
      final_interview: 0,
    });
    expect(m.responses.find((r) => r.sourceId === "ashby")).toEqual({
      sourceId: "ashby",
      applications: 2,
      responded: 1,
      rate: 0.5,
      medianDaysToFirstResponse: 4,
    });
    expect(m.responses.find((r) => r.sourceId === "email_alerts")).toMatchObject({
      rate: 0,
      medianDaysToFirstResponse: null,
    });
  });

  it("lists active engagements, committed hours and the next 7 days", () => {
    const { db, offer } = seed();
    const app = createApplication(db, { offerId: offer("ashby", daysAgo(3)).id });
    upsertEngagement(db, app.id, {
      rateMinor: 9000,
      currency: "EUR",
      ratePeriod: "hour",
      weeklyHours: 24,
      startDate: "2026-12-01",
    });
    addInterview(db, app.id, {
      type: "technical",
      scheduledAt: new Date(NOW.getTime() + 2 * 86_400_000),
      timeZone: "Europe/Madrid",
    });
    addInterview(db, app.id, {
      type: "final",
      scheduledAt: new Date(NOW.getTime() + 9 * 86_400_000),
      timeZone: "Europe/Madrid",
    });
    setNextStep(db, app.id, {
      description: "Send references",
      dueAt: new Date(NOW.getTime() + 86_400_000),
    });
    const m = dashboardMetrics(db, { days: 7, now: NOW });
    expect(m.committedHours).toBe(24);
    expect(m.upcomingInterviews.map((i) => i.type)).toEqual(["technical"]);
    expect(m.dueNextSteps.map((s) => s.description)).toEqual(["Send references"]);
  });
});

import { capacityStatus } from "@job-radar/core";
import {
  addCustomStage,
  addInterview,
  applicationTimeline,
  committedWeeklyHours,
  createApplication,
  listNotifications,
  listStages,
  moveStage,
  setNextStep,
  transitionsFor,
  updateInterview,
  upsertEngagement,
} from "@job-radar/db";
import { describe, expect, it } from "vitest";
import { Notifier } from "../src/notifier";
import { sendInterviewReminders, suggestNoResponse } from "../src/pipeline/jobs";
import { seedScoredOffer, testContext } from "./helpers";

function app(at = new Date("2026-11-01T10:00:00Z")) {
  const s = seedScoredOffer(testContext());
  const application = createApplication(s.db, { offerId: s.offer.id, at });
  return { ...s, application, notifier: new Notifier(s.db) };
}

describe("application stages", () => {
  it("records transitions with notes and supports custom stages", () => {
    const s = app();
    addCustomStage(s.db, { key: "reference_check", label: "Reference check", position: 55 });
    moveStage(s.db, s.application.id, "screening_call", { note: "Call with recruiter" });
    moveStage(s.db, s.application.id, "reference_check");
    expect(transitionsFor(s.db, s.application.id).map((t) => [t.toStage, t.note])).toEqual([
      ["applied", null],
      ["screening_call", "Call with recruiter"],
      ["reference_check", null],
    ]);
    expect(listStages(s.db).find((x) => x.key === "reference_check")?.custom).toBe(true);
  });
});

describe("14-day no-response suggestion", () => {
  it("suggests 'no response' once after 14 days without updates", () => {
    const s = app(new Date("2026-11-01T10:00:00Z"));
    expect(suggestNoResponse(s.db, s.notifier, new Date("2026-11-14T10:00:00Z"))).toBe(0);
    expect(suggestNoResponse(s.db, s.notifier, new Date("2026-11-15T10:01:00Z"))).toBe(1);
    expect(suggestNoResponse(s.db, s.notifier, new Date("2026-11-20T10:00:00Z"))).toBe(0);
    const n = listNotifications(s.db).find((x) => x.kind === "no_response");
    expect(n?.title).toBe(`No response from ${s.offer.companyName} after 14 days`);
    expect(n?.body).toContain("follow-up reminder");
  });

  it("does not suggest it when there was an update or the stage moved on", () => {
    const s = app(new Date("2026-11-01T10:00:00Z"));
    setNextStep(
      s.db,
      s.application.id,
      { description: "Follow up", dueAt: null },
      new Date("2026-11-10T10:00:00Z"),
    );
    addInterview(
      s.db,
      s.application.id,
      {
        type: "screening",
        scheduledAt: new Date("2026-11-20T10:00:00Z"),
        timeZone: "Europe/Madrid",
      },
      new Date("2026-11-10T10:00:00Z"),
    );
    expect(suggestNoResponse(s.db, s.notifier, new Date("2026-11-15T10:01:00Z"))).toBe(0);
    const t = app(new Date("2026-11-01T10:00:00Z"));
    moveStage(t.db, t.application.id, "screening_call", { at: new Date("2026-11-02T10:00:00Z") });
    expect(suggestNoResponse(t.db, t.notifier, new Date("2026-12-01T10:00:00Z"))).toBe(0);
  });
});

describe("interview reminders", () => {
  it("sends one reminder within 24 hours of the interview, again only if rescheduled", () => {
    const s = app();
    const interview = addInterview(s.db, s.application.id, {
      type: "technical",
      scheduledAt: new Date("2026-11-20T09:00:00Z"),
      timeZone: "Europe/Madrid",
      link: "https://meet.example.invalid/abc",
      interviewers: ["CTO"],
    });
    expect(sendInterviewReminders(s.db, s.notifier, new Date("2026-11-19T08:00:00Z"))).toBe(0); // 25 h before
    expect(sendInterviewReminders(s.db, s.notifier, new Date("2026-11-19T09:30:00Z"))).toBe(1);
    expect(sendInterviewReminders(s.db, s.notifier, new Date("2026-11-19T12:00:00Z"))).toBe(0);
    const reminder = listNotifications(s.db).find((n) => n.kind === "interview_reminder")!;
    expect(reminder.title).toBe(`Interview with ${s.offer.companyName}: Fri 20 Nov, 10:00 CET`);
    expect(reminder.body).toContain("Link: https://meet.example.invalid/abc");

    updateInterview(s.db, interview.id, { scheduledAt: new Date("2026-11-21T09:00:00Z") });
    expect(sendInterviewReminders(s.db, s.notifier, new Date("2026-11-20T10:00:00Z"))).toBe(1);
    expect(applicationTimeline(s.db, s.application.id).map((e) => e.kind)).toContain(
      "interview_added",
    );
  });
});

describe("capacity warning", () => {
  it("warns when active engagements exceed the weekly capacity", () => {
    const s = app();
    upsertEngagement(s.db, s.application.id, {
      rateMinor: 9000,
      currency: "EUR",
      ratePeriod: "hour",
      weeklyHours: 30,
      startDate: "2026-12-01",
    });
    const t = seedScoredOffer({ db: s.db, profile: s.profile });
    const second = createApplication(s.db, { offerId: t.offer.id });
    upsertEngagement(s.db, second.id, {
      rateMinor: 600_00,
      currency: "EUR",
      ratePeriod: "day",
      weeklyHours: 16,
      startDate: "2026-12-01",
    });
    const capacity = s.profile.get()!.preferences.engagement.weekly_capacity_hours;
    expect(committedWeeklyHours(s.db)).toBe(46);
    expect(capacityStatus(committedWeeklyHours(s.db), capacity)).toEqual({
      committed: 46,
      capacity: 40,
      remaining: -6,
      over: true,
    });
    upsertEngagement(s.db, second.id, {
      rateMinor: 600_00,
      currency: "EUR",
      ratePeriod: "day",
      weeklyHours: 16,
      startDate: "2026-12-01",
      active: false,
    });
    expect(capacityStatus(committedWeeklyHours(s.db), capacity).over).toBe(false);
  });
});

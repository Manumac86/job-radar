import { FakeLlmClient, LlmBudget, MemoryUsageStore, SAMPLE_INTERVIEW_PREP } from "@job-radar/core";
import {
  createApplication,
  latestInterviewPrep,
  listNotifications,
  moveStage,
  responsePatterns,
} from "@job-radar/db";
import { describe, expect, it } from "vitest";
import { Notifier } from "../src/notifier";
import { sendFollowUpReminders } from "../src/pipeline/jobs";
import { PrepService } from "../src/pipeline/prep";
import { seedScoredOffer, testContext } from "./helpers";

const DAY = 86_400_000;
const T0 = new Date("2026-11-01T10:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function app() {
  const s = seedScoredOffer(testContext());
  const application = createApplication(s.db, { offerId: s.offer.id, at: T0 });
  return { ...s, application, notifier: new Notifier(s.db) };
}

const followUps = (s: ReturnType<typeof app>) =>
  listNotifications(s.db).filter((n) => n.kind === "follow_up");

describe("follow-up reminders", () => {
  it("fires once per threshold, never before it", () => {
    const s = app();
    sendFollowUpReminders(s.db, s.notifier, [7, 14], at(6));
    expect(followUps(s)).toHaveLength(0);
    sendFollowUpReminders(s.db, s.notifier, [7, 14], at(7.1));
    sendFollowUpReminders(s.db, s.notifier, [7, 14], at(8));
    expect(followUps(s).map((n) => n.title)).toEqual([
      expect.stringContaining("7 days without news"),
    ]);
    sendFollowUpReminders(s.db, s.notifier, [7, 14], at(14.5));
    expect(followUps(s)).toHaveLength(2);
  });

  it("sends only the latest threshold when starting late, and stops after a reply", () => {
    const s = app();
    sendFollowUpReminders(s.db, s.notifier, [7, 14], at(20));
    expect(followUps(s).map((n) => n.title)).toEqual([expect.stringContaining("14 days")]);
    moveStage(s.db, s.application.id, "screening_call", { at: at(21) });
    sendFollowUpReminders(s.db, s.notifier, [7, 14], at(60));
    expect(followUps(s)).toHaveLength(1);
  });

  it("is off with an empty list", () => {
    const s = app();
    expect(sendFollowUpReminders(s.db, s.notifier, [], at(30))).toBe(0);
  });
});

describe("interview prep", () => {
  function prepService(
    s: ReturnType<typeof app>,
    client = new FakeLlmClient([SAMPLE_INTERVIEW_PREP]),
  ) {
    const budget = new LlmBudget(new MemoryUsageStore(), () => ({ scoring: 10, drafts: 10 }));
    return {
      client,
      prep: new PrepService({ db: s.db, profile: s.profile, client, budget, notifier: s.notifier }),
    };
  }

  it("prepares automatically once per interview stage and notifies", async () => {
    const s = app();
    const { prep, client } = prepService(s);
    expect(await prep.autoPrepare(s.application.id)).toBeNull(); // still "applied"
    moveStage(s.db, s.application.id, "technical_interview");
    const plan = await prep.autoPrepare(s.application.id);
    expect(plan?.stage).toBe("technical_interview");
    expect(plan?.plan.questions_to_ask).toContain("How do you measure retrieval quality?");
    expect(await prep.autoPrepare(s.application.id)).toBeNull(); // already prepared
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.prompt).toContain("Round to prepare: Technical interview");
    expect(listNotifications(s.db).filter((n) => n.kind === "interview_prep")).toHaveLength(1);
    expect(latestInterviewPrep(s.db, s.application.id)?.id).toBe(plan?.id);
  });

  it("does not fail the move when the LLM is unavailable", async () => {
    const s = app();
    const { prep } = prepService(
      s,
      new FakeLlmClient([new Error("offline"), new Error("offline")]),
    );
    moveStage(s.db, s.application.id, "screening_call");
    expect(await prep.autoPrepare(s.application.id)).toBeNull();
    expect(latestInterviewPrep(s.db, s.application.id)).toBeUndefined();
  });
});

describe("response patterns", () => {
  it("groups response and interview rates by dimension", () => {
    const s = app();
    const other = seedScoredOffer(s, 65);
    const second = createApplication(s.db, { offerId: other.offer.id, at: T0 });
    moveStage(s.db, s.application.id, "technical_interview", { at: at(3) });
    const p = responsePatterns(s.db);
    expect(p.total).toBe(2);
    expect(p.responded).toBe(1);
    const score = p.dimensions.find((d) => d.key === "score")!;
    expect(score.rows).toEqual([
      { value: "80–89", applications: 1, responded: 1, interviewed: 1, rate: 1 },
      { value: "Below 70", applications: 1, responded: 0, interviewed: 0, rate: 0 },
    ]);
    expect(second.stage).toBe("applied");
  });
});

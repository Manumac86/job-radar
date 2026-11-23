import {
  FakeLlmClient,
  LlmBudget,
  MemoryUsageStore,
  SAMPLE_INTERVIEW_PREP,
  type ModelScore,
} from "@job-radar/core";
import { addNote, addPersonToOffer, createApplication, moveStage } from "@job-radar/db";
import { describe, expect, it } from "vitest";
import { Notifier } from "../src/notifier";
import { PrepService } from "../src/pipeline/prep";
import { ScoringService } from "../src/scoring/service";
import { seedScoredOffer, testContext } from "./helpers";

// contacts spec, "Contact details stay manual and private" (offer-notes-and-people D6).
const JANE = {
  name: "Jane Roe",
  role: "Recruiter",
  linkedinUrl: "https://www.linkedin.com/in/jane-roe-example",
  email: "jane@contoso.example",
  phone: "+00 000 000 000",
  other: "@janeroe on Telegram",
  note: "Met at a meetup",
};
const SECRETS = [JANE.name, JANE.email, JANE.linkedinUrl, JANE.phone, JANE.other, JANE.note];

const modelScore: ModelScore = {
  overall: 80,
  skills_fit: 80,
  seniority_fit: 80,
  rate_fit: 50,
  location_fit: 80,
  engagement_fit: 80,
  rationale: "Good overlap.",
  red_flags: [],
  service_lines: [],
  is_leadership: false,
  eligibility: { restricted_to: [], owner_eligible: true },
  company: { stage: "unknown", engineering_team_size: null },
};

function setup() {
  const s = seedScoredOffer(testContext());
  addPersonToOffer(s.db, s.offer.id, JANE);
  const application = createApplication(s.db, { offerId: s.offer.id });
  const budget = new LlmBudget(new MemoryUsageStore(), () => ({ scoring: 10, drafts: 10 }));
  return { ...s, application, budget, notifier: new Notifier(s.db) };
}

const prompts = (client: FakeLlmClient) =>
  client.requests.map((r) => `${r.system ?? ""}\n${r.prompt}`).join("\n");

describe("people never reach the LLM", () => {
  it("interview prep", async () => {
    const s = setup();
    const client = new FakeLlmClient([SAMPLE_INTERVIEW_PREP]);
    const prep = new PrepService({
      db: s.db,
      profile: s.profile,
      client,
      budget: s.budget,
      notifier: s.notifier,
    });
    moveStage(s.db, s.application.id, "technical_interview");
    expect(await prep.autoPrepare(s.application.id)).not.toBeNull();
    const text = prompts(client);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it("scoring", async () => {
    const s = setup();
    const client = new FakeLlmClient([], () => modelScore);
    const scoring = new ScoringService({
      db: s.db,
      profile: s.profile,
      client,
      budget: s.budget,
      notifier: s.notifier,
    });
    scoring.enqueue([s.offer.id]);
    await scoring.idle();
    expect(client.requests.length).toBeGreaterThan(0);
    const text = prompts(client);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it("notes stay in the timeline only", () => {
    const s = setup();
    const note = addNote(s.db, s.offer.id, "Contacted on Telegram");
    expect(note.applicationId).toBe(s.application.id);
  });
});

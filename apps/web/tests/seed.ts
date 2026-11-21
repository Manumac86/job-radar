// Seeds an isolated test database for the UI tests (never the real data/ directory).
import {
  addTimelineEvent,
  createApplication,
  createDraft,
  insertApplicationEmail,
  insertPortalApplication,
  transitionForPortal,
  updatePortalApplication,
  moveStage,
  transitionForEmail,
  updateApplicationEmail,
  insertOffer,
  openDatabase,
  recordScore,
  setTriage,
  upsertCompany,
  upsertSource,
} from "@job-radar/db";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env["JOB_RADAR_DATA_DIR"];
if (!dataDir || !dataDir.includes("job-radar-ui-test"))
  throw new Error("Refusing to seed outside a UI-test data dir");
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(join(dataDir, "profile"), { recursive: true });
const seedDir = join(import.meta.dirname, "..", "..", "..", "profile-seed");
for (const f of ["cv.md", "preferences.yaml", "companies.yaml"])
  cpSync(join(seedDir, f), join(dataDir, "profile", f));

const db = openDatabase();
upsertSource(db, { id: "ashby", type: "ashby", name: "Ashby job boards", enabled: true });
upsertSource(db, { id: "remoteok", type: "remoteok", name: "RemoteOK", enabled: false });
upsertSource(db, { id: "fake", type: "fake", name: "Test source", enabled: true });
upsertSource(db, { id: "upwork", type: "upwork", name: "Upwork (logged-in)", requiresLogin: true });
upsertSource(db, {
  id: "simpleapply",
  type: "simpleapply",
  name: "SimpleApply (logged-in)",
  requiresLogin: true,
});

const offers: [
  string,
  string,
  number,
  "strong" | "possible" | "weak",
  "contract" | "full-time",
  string,
][] = [
  ["Contract AI Engineer", "Northwind", 90, "strong", "contract", "ashby"],
  ["Staff Frontend Engineer", "Contoso", 85, "strong", "full-time", "ashby"],
  ["RAG Consultant", "Fabrikam", 70, "possible", "contract", "remoteok"],
  ["PHP Maintainer", "Litware", 40, "weak", "contract", "remoteok"],
  ["Fractional CTO", "Tailspin", 82, "strong", "contract", "ashby"],
  // Dismissed in learning.spec.ts.
  ["Blockchain Engineer", "Chainlab", 64, "possible", "full-time", "ashby"],
  ["Web3 Backend Engineer", "Tokenly", 62, "possible", "full-time", "ashby"],
  // Shortlisted for cv-variants.spec.ts (CV recommendation, draft and CV sent).
  ["Head of Platform", "Woodgrove", 66, "possible", "full-time", "ashby"],
];
offers.forEach(([title, company, score, cls, engagement, source], i) => {
  const c = upsertCompany(db, {
    name: company,
    normalizedName: company.toLowerCase(),
    // Researched in research.spec.ts (the test-mode agent reads the company site). Its offer
    // is dismissed by then, so the rescore after research leaves other specs' scores alone.
    website: company === "Tokenly" ? "https://tokenly.example" : null,
  });
  const offer = insertOffer(db, {
    sourceId: source,
    externalId: `seed-${i}`,
    sourceUrl: `https://jobs.example.invalid/${i}`,
    title,
    normalizedTitle: title.toLowerCase(),
    companyId: c.id,
    companyName: company,
    remotePolicy: "remote",
    engagementType: engagement,
    compMin: 9000,
    compMax: 9000,
    compCurrency: "EUR",
    compPeriod: "hour",
    rateUnknown: false,
    description: `${title} at ${company}. Agentic RAG, TypeScript and Next.js.`,
    postedAt: new Date(Date.now() - i * 86_400_000),
    // Imported from a LinkedIn link: a long company URL in the metadata (offer-detail.spec.ts).
    ...(title === "Contract AI Engineer"
      ? {
          companyMeta: {
            via: "LinkedIn link",
            linkedin:
              "https://es.linkedin.com/company/northwind-consulting-and-engineering-services",
            seniority_level: "Mid-Senior level",
          },
        }
      : {}),
  });
  recordScore(db, {
    offerId: offer.id,
    overall: score,
    modelOverall: score,
    skillsFit: score,
    seniorityFit: score,
    rateFit: 80,
    locationFit: 90,
    engagementFit: 80,
    scoreClass: cls,
    rationale: `Seeded rationale for ${title}.`,
    redFlags: [],
    serviceLines: ["agentic-rag"],
    model: "seed",
  });
  if (i === 1) createApplication(db, { offerId: offer.id });
  if (title === "Head of Platform") setTriage(db, offer.id, "shortlisted");
  if (i === 0) {
    createDraft(db, {
      offerId: offer.id,
      message: "Hello Northwind, I led the frontend of an agentic RAG platform.",
      screeningAnswers: [],
      suggestedRate: {
        amount: 90,
        currency: "EUR",
        period: "hour",
        reasoning: "Within your target.",
      },
      verifyBeforeSending: ["Placeholder to fill: [portfolio link]"],
      model: "seed",
    });
  }
});
// Replies for mail.spec.ts (application-emails): two applications at one fictional company,
// one already moved by an email (with Undo) and one suggestion that could be either.
const adatum = upsertCompany(db, {
  name: "Adatum",
  normalizedName: "adatum",
  website: "https://adatum.example",
});
const adatumApps = ["Platform Engineer", "Data Platform Engineer"].map((title, i) => {
  const offer = insertOffer(db, {
    sourceId: "ashby",
    externalId: `seed-adatum-${i}`,
    sourceUrl: `https://jobs.example.invalid/adatum-${i}`,
    title,
    normalizedTitle: title.toLowerCase(),
    companyId: adatum.id,
    companyName: "Adatum",
    remotePolicy: "remote",
    engagementType: "full-time",
    description: `${title} at Adatum.`,
  });
  return createApplication(db, {
    offerId: offer.id,
    at: new Date(Date.now() - (5 - i) * 86_400_000),
  });
});
const [platform, dataPlatform] = adatumApps as [
  (typeof adatumApps)[number],
  (typeof adatumApps)[number],
];
const invite = insertApplicationEmail(db, {
  messageId: "<invite-1@adatum.example>",
  folder: "INBOX",
  receivedAt: new Date(Date.now() - 3_600_000),
  fromName: "Dana at Adatum",
  fromAddress: "dana@adatum.example",
  subject: "Platform Engineer: next steps",
  excerpt: "We'd like to schedule a screening call.",
  candidates: [platform.id, dataPlatform.id],
  status: "queued",
});
if (!invite) throw new Error("seed: invite email");
moveStage(db, platform.id, "screening_call", {
  note: "From email",
  source: "email",
  emailId: invite.id,
});
updateApplicationEmail(db, invite.id, {
  applicationId: platform.id,
  category: "interview_invitation",
  confidence: "high",
  summary: "Invites you to a screening call next week.",
  status: "auto_applied",
  result: {
    reply: {
      applicationId: platform.id,
      category: "interview_invitation",
      confidence: "high",
      summary: "Invites you to a screening call next week.",
      nextStep: null,
      interview: { kind: "screening", scheduledAt: null, timeZone: null, link: null },
      issues: [],
    },
    decision: { action: "auto", targetStage: "screening_call", reasons: [] },
  },
  undo: {
    previousStage: "applied",
    targetStage: "screening_call",
    transitionId: transitionForEmail(db, invite.id)?.id ?? null,
    previousNextStep: null,
    nextStepId: null,
    nextStep: null,
    interviewId: null,
    interviewScheduledAt: null,
    previousFirstResponseAt: null,
  },
});
addTimelineEvent(db, {
  offerId: platform.offerId,
  applicationId: platform.id,
  kind: "email",
  message: "Email from Dana at Adatum: Invites you to a screening call next week.",
  data: { emailId: invite.id, status: "auto_applied" },
});
insertApplicationEmail(db, {
  messageId: "<task-1@adatum.example>",
  folder: "INBOX",
  receivedAt: new Date(Date.now() - 1_800_000),
  fromName: "Adatum Hiring",
  fromAddress: "jobs@adatum.example",
  subject: "Your take-home assignment",
  excerpt: "Here is the take-home assignment for your application.",
  candidates: [dataPlatform.id, platform.id],
  category: "take_home",
  confidence: "medium",
  summary: "Sends a take-home assignment due in a week.",
  status: "suggested",
  result: {
    reply: {
      applicationId: null,
      category: "take_home",
      confidence: "medium",
      summary: "Sends a take-home assignment due in a week.",
      nextStep: { description: "Submit the take-home", dueAt: null },
      interview: null,
      issues: [],
    },
    decision: {
      action: "suggest",
      targetStage: null,
      reasons: ["medium confidence", "not sure which application it is about"],
    },
  },
});

// MyGreenhouse statuses (mygreenhouse-source): one automatic rejection, one suggestion.
const fourth = upsertCompany(db, { name: "Fourth Coffee", normalizedName: "fourth coffee" });
const [moved, inactive] = ["Backend Engineer", "Integrations Engineer"].map((title, i) => {
  const offer = insertOffer(db, {
    sourceId: "ashby",
    externalId: `fourthcoffee:43000000${i}`,
    sourceUrl: `https://job-boards.greenhouse.io/fourthcoffee/jobs/43000000${i}`,
    title,
    normalizedTitle: title.toLowerCase(),
    companyId: fourth.id,
    companyName: "Fourth Coffee",
    remotePolicy: "remote",
    engagementType: "full-time",
    description: `${title} at Fourth Coffee.`,
  });
  return createApplication(db, { offerId: offer.id, at: new Date(Date.now() - 4 * 86_400_000) });
}) as [ReturnType<typeof createApplication>, ReturnType<typeof createApplication>];
const seen = new Date(Date.now() - 2 * 3_600_000);
const rejectedRow = insertPortalApplication(db, {
  source: "mygreenhouse",
  portalId: "200000001",
  jobKey: "fourthcoffee:430000000",
  company: "Fourth Coffee",
  title: "Backend Engineer",
  url: "https://job-boards.greenhouse.io/fourthcoffee/jobs/430000000",
  applicationId: moved.id,
  lastStatus: "Rejected",
  statusSeenAt: seen,
  category: "rejection",
  status: "auto_applied",
  pending: { targetStage: "rejected", reasons: [] },
});
moveStage(db, moved.id, "rejected", {
  note: "From MyGreenhouse",
  source: "greenhouse",
  portalApplicationId: rejectedRow.id,
});
updatePortalApplication(db, rejectedRow.id, {
  undo: {
    previousStage: "applied",
    targetStage: "rejected",
    transitionId: transitionForPortal(db, rejectedRow.id)?.id ?? null,
    previousNextStep: null,
    nextStepId: null,
    nextStep: null,
    interviewId: null,
    interviewScheduledAt: null,
    previousFirstResponseAt: null,
  },
});
const inactiveRow = insertPortalApplication(db, {
  source: "mygreenhouse",
  portalId: "200000002",
  jobKey: "fourthcoffee:430000001",
  company: "Fourth Coffee",
  title: "Integrations Engineer",
  url: "https://job-boards.greenhouse.io/fourthcoffee/jobs/430000001",
  applicationId: inactive.id,
  lastStatus: "inactive",
  statusSeenAt: seen,
  category: "closed",
  status: "suggested",
  pending: {
    targetStage: "rejected",
    reasons: ["Greenhouse only says the application is inactive: rejected, or the job closed"],
  },
});
for (const [app, row, suffix] of [
  [moved, rejectedRow, ""],
  [inactive, inactiveRow, " (suggestion)"],
] as const)
  addTimelineEvent(db, {
    offerId: app.offerId,
    applicationId: app.id,
    kind: "portal_status",
    message: `MyGreenhouse: ${row.lastStatus}${suffix}`,
    data: { portalApplicationId: row.id, status: row.status },
    at: seen,
  });

db.$client.close();
console.log(`Seeded UI test data in ${dataDir}`);

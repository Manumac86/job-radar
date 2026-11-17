// Seeds an isolated test database for the UI tests (never the real data/ directory).
import {
  createApplication,
  createDraft,
  insertOffer,
  openDatabase,
  recordScore,
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
db.$client.close();
console.log(`Seeded UI test data in ${dataDir}`);

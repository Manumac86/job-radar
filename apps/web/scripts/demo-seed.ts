// Fills a throwaway data dir with fictitious offers, applications and notifications, to try the UI
// or take screenshots without real data:
//   JOB_RADAR_DATA_DIR=/tmp/job-radar-demo pnpm --filter @job-radar/web demo:seed
// Every company and person here is invented.
import {
  createApplication,
  createDraft,
  createNotification,
  finishRun,
  insertOffer,
  moveStage,
  openDatabase,
  recordScore,
  setTriage,
  startRun,
  upsertCompany,
  upsertSource,
} from "@job-radar/db";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env["JOB_RADAR_DATA_DIR"];
if (!dataDir || !dataDir.includes("job-radar-demo"))
  throw new Error("Set JOB_RADAR_DATA_DIR to a folder whose name contains job-radar-demo");
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(join(dataDir, "profile"), { recursive: true });
const seedDir = join(import.meta.dirname, "..", "..", "..", "profile-seed");
for (const f of ["cv.md", "preferences.yaml", "companies.yaml"])
  cpSync(join(seedDir, f), join(dataDir, "profile", f));

const db = openDatabase();
const day = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * day - hours * 3_600_000);

const sources = [
  ["ashby", "ashby", "Ashby job boards"],
  ["greenhouse", "greenhouse", "Greenhouse job boards"],
  ["lever", "lever", "Lever job boards"],
  ["ycombinator", "ycombinator", "Y Combinator"],
  ["hackernews", "hackernews", "Hacker News: Who is hiring"],
  ["remoteok", "remoteok", "RemoteOK"],
  ["weworkremotely", "weworkremotely", "We Work Remotely"],
  ["email_alerts", "email_alerts", "Job-alert emails"],
] as const;
for (const [id, type, name] of sources) {
  upsertSource(db, { id, type, name, enabled: true });
  const run = startRun(db, id, "schedule", ago(0, 2));
  if (run)
    finishRun(db, run.id, {
      status: "ok",
      found: 20 + id.length * 3,
      newCount: 3 + (id.length % 5),
      filtered: 8 + (id.length % 7),
      duplicates: 2,
      at: ago(0, 2),
    });
}

type Cls = "strong" | "possible" | "weak";
interface Demo {
  title: string;
  company: string;
  source: string;
  score: number;
  engagement: "contract" | "full-time" | "part-time";
  comp: [number, number, string, "hour" | "day" | "year"] | null;
  days: number;
  why: string;
  flags?: string[];
  triage?: "shortlisted" | "dismissed";
  stage?: string;
}

const demo: Demo[] = [
  {
    title: "Senior AI Engineer (LLM apps)",
    company: "Northwind Health",
    source: "ashby",
    score: 92,
    engagement: "full-time",
    comp: [140_000, 170_000, "USD", "year"],
    days: 0,
    why: "Production RAG and evaluation work matches the CV closely; remote across EMEA.",
    triage: "shortlisted",
  },
  {
    title: "Founding Full-Stack Engineer",
    company: "Relecloud",
    source: "ycombinator",
    score: 88,
    engagement: "full-time",
    comp: [130_000, 160_000, "USD", "year"],
    days: 1,
    why: "Next.js and Node stack, seed stage, team of 6: inside the target.",
    stage: "technical_interview",
  },
  {
    title: "Contract LLM Engineer",
    company: "Trey Research",
    source: "hackernews",
    score: 86,
    engagement: "contract",
    comp: [85, 100, "EUR", "hour"],
    days: 1,
    why: "Six-month contract building an agent over internal docs; rate above target.",
    stage: "screening_call",
  },
  {
    title: "Staff Frontend Engineer, Design Systems",
    company: "Contoso",
    source: "greenhouse",
    score: 84,
    engagement: "full-time",
    comp: [120_000, 150_000, "EUR", "year"],
    days: 2,
    why: "Design-system ownership and React depth; staff level is a stretch but evidenced.",
    stage: "applied",
  },
  {
    title: "AI Product Engineer",
    company: "Proseware",
    source: "lever",
    score: 81,
    engagement: "full-time",
    comp: null,
    days: 2,
    why: "Ships LLM features end to end; salary not stated.",
    flags: ["Rate unknown"],
    triage: "shortlisted",
  },
  {
    title: "Senior Full-Stack Engineer (TypeScript)",
    company: "Fabrikam Labs",
    source: "weworkremotely",
    score: 78,
    engagement: "full-time",
    comp: [90_000, 110_000, "EUR", "year"],
    days: 3,
    why: "Good stack fit; product is B2B analytics.",
    stage: "final_interview",
  },
  {
    title: "Tech Lead, Search & Retrieval",
    company: "Woodgrove",
    source: "ashby",
    score: 76,
    engagement: "full-time",
    comp: [150_000, 180_000, "USD", "year"],
    days: 3,
    why: "Retrieval experience fits; asks for 4 h overlap with US Pacific.",
    flags: ["Overlap with US Pacific"],
  },
  {
    title: "Freelance Next.js Developer",
    company: "Wingtip Toys",
    source: "email_alerts",
    score: 72,
    engagement: "contract",
    comp: [60, 70, "EUR", "hour"],
    days: 4,
    why: "Short e-commerce rebuild; rate at the minimum.",
    stage: "offer_received",
  },
  {
    title: "Frontend Engineer, Data Visualization",
    company: "Lucerne Publishing",
    source: "remoteok",
    score: 68,
    engagement: "full-time",
    comp: [70_000, 85_000, "EUR", "year"],
    days: 4,
    why: "Strong React fit, below target salary.",
  },
  {
    title: "Backend Engineer (Node.js)",
    company: "Adatum",
    source: "greenhouse",
    score: 64,
    engagement: "full-time",
    comp: [80_000, 95_000, "EUR", "year"],
    days: 5,
    why: "Backend-only role; less product ownership than wanted.",
    stage: "rejected",
  },
  {
    title: "Machine Learning Engineer",
    company: "Tailspin Analytics",
    source: "lever",
    score: 61,
    engagement: "full-time",
    comp: [110_000, 130_000, "USD", "year"],
    days: 5,
    why: "Mostly model training in Python; LLM integration is a small part.",
  },
  {
    title: "Developer Advocate, AI",
    company: "Fourth Coffee",
    source: "ycombinator",
    score: 55,
    engagement: "full-time",
    comp: null,
    days: 6,
    why: "Advocacy role with travel; not an engineering target.",
    flags: ["Rate unknown", "Travel 30%"],
  },
  {
    title: "Senior PHP Developer",
    company: "Litware",
    source: "weworkremotely",
    score: 32,
    engagement: "full-time",
    comp: [45_000, 55_000, "EUR", "year"],
    days: 6,
    why: "PHP-only stack and salary below minimum.",
    flags: ["Rate below minimum (≈27 EUR/h < 55 EUR/h)"],
    triage: "dismissed",
  },
  {
    title: "Blockchain Engineer",
    company: "Coho Chain",
    source: "remoteok",
    score: 38,
    engagement: "full-time",
    comp: [100_000, 120_000, "USD", "year"],
    days: 7,
    why: "Web3 protocol work; outside your targets.",
    flags: ["Matches what you avoid: crypto and web3"],
    triage: "dismissed",
  },
  {
    title: "Full-Stack Engineer, Payments",
    company: "Wide World Importers",
    source: "ashby",
    score: 74,
    engagement: "full-time",
    comp: [95_000, 115_000, "EUR", "year"],
    days: 8,
    why: "Payments dashboards, React and PostgreSQL: close to Contoso experience.",
  },
  {
    title: "AI Engineer, Agents",
    company: "VanArsdel",
    source: "hackernews",
    score: 83,
    engagement: "contract",
    comp: [90, 110, "USD", "hour"],
    days: 9,
    why: "Agent tooling for support teams; remote contract.",
    stage: "applied",
  },
  {
    title: "Senior React Native Engineer",
    company: "Margie's Travel",
    source: "greenhouse",
    score: 47,
    engagement: "full-time",
    comp: [70_000, 80_000, "EUR", "year"],
    days: 10,
    why: "Mobile-first; little web or AI work.",
  },
  {
    title: "Product Engineer, Copilot",
    company: "Alpine Ski House",
    source: "lever",
    score: 79,
    engagement: "full-time",
    comp: [105_000, 125_000, "EUR", "year"],
    days: 12,
    why: "Copilot features in a SaaS product; good fit.",
    stage: "no_response",
  },
];

const cls = (s: number): Cls => (s >= 80 ? "strong" : s >= 60 ? "possible" : "weak");
demo.forEach((d, i) => {
  const c = upsertCompany(db, { name: d.company, normalizedName: d.company.toLowerCase() });
  const offer = insertOffer(db, {
    sourceId: d.source,
    externalId: `demo-${i}`,
    sourceUrl: `https://jobs.example.invalid/demo/${i}`,
    title: d.title,
    normalizedTitle: d.title.toLowerCase(),
    companyId: c.id,
    companyName: d.company,
    remotePolicy: "remote",
    engagementType: d.engagement,
    compMin: d.comp ? d.comp[0] * 100 : null,
    compMax: d.comp ? d.comp[1] * 100 : null,
    compCurrency: d.comp ? d.comp[2] : null,
    compPeriod: d.comp ? d.comp[3] : null,
    rateUnknown: !d.comp,
    description: `${d.title} at ${d.company}. Remote. TypeScript, React and LLM features.`,
    postedAt: ago(d.days, 3),
    firstSeenAt: ago(d.days, 2),
  });
  recordScore(db, {
    offerId: offer.id,
    overall: d.score,
    modelOverall: d.score,
    skillsFit: Math.min(100, d.score + 4),
    seniorityFit: Math.min(100, d.score + 2),
    rateFit: d.comp ? Math.min(100, d.score) : 50,
    locationFit: 90,
    engagementFit: 85,
    scoreClass: cls(d.score),
    rationale: d.why,
    redFlags: d.flags ?? [],
    serviceLines: d.score >= 75 ? ["llm-features"] : ["full-stack-product"],
    model: "demo",
  });
  if (d.triage) setTriage(db, offer.id, d.triage, d.triage === "dismissed" ? "Not a fit" : null);
  if (d.score >= 80 && !d.stage) {
    createDraft(db, {
      offerId: offer.id,
      message: `Hi ${d.company} team, I build LLM features in production: at Northwind Analytics I shipped a retrieval-augmented assistant used by 3,000 analysts a week. I would love to bring that to your team.`,
      screeningAnswers: [],
      suggestedRate: d.comp
        ? { amount: 80, currency: "EUR", period: "hour", reasoning: "Within your target." }
        : null,
      verifyBeforeSending: ["Placeholder to fill: [portfolio link]"],
      model: "demo",
    });
  }
  if (d.stage) {
    const app = createApplication(db, { offerId: offer.id, at: ago(d.days + 6) });
    const path: Record<string, string[]> = {
      applied: [],
      screening_call: ["screening_call"],
      technical_interview: ["screening_call", "technical_interview"],
      final_interview: ["screening_call", "technical_interview", "final_interview"],
      offer_received: ["screening_call", "technical_interview", "offer_received"],
      rejected: ["screening_call", "rejected"],
      no_response: ["no_response"],
    };
    (path[d.stage] ?? []).forEach((stage, k) =>
      moveStage(db, app.id, stage, { at: ago(d.days + 4 - k) }),
    );
  }
  if (d.score >= 85)
    createNotification(db, {
      kind: "strong_match",
      title: `Strong match (${d.score}): ${d.title} at ${d.company}`,
      body: d.why,
      offerId: offer.id,
      dedupeKey: `demo-strong-${i}`,
      telegramStatus: "sent",
    });
});

// Background volume for the ingestion chart: offers dropped by the keyword pre-filter.
const filteredTitles = ["Junior Developer", "Sales Engineer", "PHP Developer", "On-site QA Lead"];
for (let i = 0; i < 90; i++) {
  const [id] = sources[i % sources.length]!;
  const daysAgo = (i * 5) % 21;
  const title = filteredTitles[i % filteredTitles.length]!;
  const offer = insertOffer(db, {
    sourceId: id,
    externalId: `demo-filtered-${i}`,
    sourceUrl: `https://jobs.example.invalid/filtered/${i}`,
    title,
    normalizedTitle: title.toLowerCase(),
    companyName: "Example Co",
    remotePolicy: "remote",
    rateUnknown: true,
    description: `${title}.`,
    postedAt: ago(daysAgo, 4),
    firstSeenAt: ago(daysAgo, 3),
  });
  setTriage(db, offer.id, "filtered", "Pre-filter: title");
}

db.$client.close();
console.log(`Seeded demo data in ${dataDir}`);

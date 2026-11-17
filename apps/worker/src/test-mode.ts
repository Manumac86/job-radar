// JOB_RADAR_TEST_MODE=1 (UI tests only): no network sources, no real LLM, no schedules.
import {
  FakeLlmClient,
  FakeResearchClient,
  SAMPLE_INTERVIEW_PREP,
  SAMPLE_LEARNING_OPS,
  SAMPLE_RESEARCH,
  normalizeSourceUrl,
} from "@job-radar/core";
import { registerAdapter, type PageReader, type SourceAdapter } from "@job-radar/sources";

export const TEST_MODE = process.env["JOB_RADAR_TEST_MODE"] === "1";

const fakeAdapter: SourceAdapter = {
  type: "fake",
  label: "Test source",
  defaultIntervalMinutes: 60,
  async fetchOffers(ctx) {
    ctx.log("fake source: 2 offers");
    await new Promise((r) => setTimeout(r, 400));
    return [1, 2].map((i) => ({
      sourceId: ctx.sourceId,
      externalId: `fake-${i}`,
      sourceUrl: `https://jobs.example.invalid/fake-${i}`,
      title: i === 1 ? "Senior AI Engineer (test)" : "Fractional CTO (test)",
      companyName: `Test Company ${i}`,
      remotePolicy: "remote" as const,
      description: "Agentic RAG with TypeScript and Next.js.",
    }));
  },
};

/** No network in test mode: every public https page "reads" as a short static text. */
function fakePageReader(): PageReader {
  const readUrls = new Set<string>();
  return {
    readUrls,
    async read(url) {
      const n = normalizeSourceUrl(url);
      if (!n || !url.startsWith("https://"))
        throw new Error("Only public https pages in test mode");
      readUrls.add(n);
      return { url, title: "Test page", text: "About the company (test mode).", truncated: false };
    },
  };
}

export function setupTestMode(): {
  llmClient: FakeLlmClient;
  researchClient: FakeResearchClient;
  newPageReader: () => PageReader;
} | null {
  if (!TEST_MODE) return null;
  registerAdapter(fakeAdapter);
  const llmClient = new FakeLlmClient([], (req) =>
    req.schemaName === "interview_prep"
      ? SAMPLE_INTERVIEW_PREP
      : req.schemaName === "learned_preferences"
        ? SAMPLE_LEARNING_OPS([...req.prompt.matchAll(/^Offer #(\d+):/gm)].map((m) => Number(m[1])))
        : req.schemaName === "imported_offer"
          ? {
              is_job_offer: true,
              title: "Founding AI Engineer",
              company: "Imported Labs",
              location: "Remote (Europe)",
              remote_policy: "remote",
              engagement_type: "full-time",
              compensation_text: null,
            }
          : req.kind === "drafting"
            ? {
                message:
                  "Test-mode draft: I led the frontend of an agentic RAG analytics platform and would like to help.",
                screening_answers: [],
                suggested_rate: {
                  amount: 90,
                  currency: "EUR",
                  period: "hour",
                  reasoning: "Test mode.",
                },
                verify_before_sending: [],
              }
            : {
                overall: 84,
                skills_fit: 90,
                seniority_fit: 80,
                rate_fit: 50,
                location_fit: 90,
                engagement_fit: 80,
                rationale: "Test-mode score: strong overlap with your agentic RAG work.",
                red_flags: [],
                service_lines: ["agentic-rag"],
                is_leadership: false,
                eligibility: { restricted_to: [], owner_eligible: true },
                company: { stage: "unknown", engineering_team_size: null },
              },
  );
  return {
    llmClient,
    researchClient: new FakeResearchClient([], SAMPLE_RESEARCH),
    newPageReader: fakePageReader,
  };
}

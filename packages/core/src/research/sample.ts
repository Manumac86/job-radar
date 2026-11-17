// Deterministic research for JOB_RADAR_TEST_MODE and tests: reads the company's site (when
// one is given) and returns a profile citing it, plus one fact citing a page never read.
import type { LlmRequest } from "../llm/client";
import type { ResearchTools } from "../llm/research-client";
import type { CompanyProfile } from "./schema";

export async function SAMPLE_RESEARCH(
  req: LlmRequest<unknown>,
  tools: ResearchTools,
): Promise<CompanyProfile> {
  const site = /Website: (https?:\S+)/.exec(req.prompt)?.[1] ?? null;
  const name = /Name: (.+)/.exec(req.prompt)?.[1]?.trim() ?? "The company";
  let read: string | null = null;
  if (site) {
    try {
      await tools.readPage(site);
      read = site;
    } catch {
      read = null;
    }
  }
  const sources = read ? [read] : [];
  const f = <T>(value: T) => (sources.length ? { value, sources } : null);
  return {
    website: site,
    product: f(`${name} builds AI tooling for logistics teams.`),
    funding: f({ stage: "series-b", last_round: "Series B", date: "2026-10", amount: "30 M EUR" }),
    headcount: { value: 9999, sources: ["https://never-read.example/about"] },
    engineering_team_size: f(40),
    headquarters: f("Madrid, Spain"),
    remote_policy: f("Remote within Europe"),
    tech_stack: f(["TypeScript", "Python", "Postgres"]),
    news: read
      ? [{ date: "2026-10", headline: `${name} raises a 30 M EUR Series B`, source: read }]
      : [],
    red_flags: [],
  };
}

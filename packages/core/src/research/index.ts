// One company research (company-research spec; design D3–D4): the agent searches and reads,
// returns a profile, and the profile is grounded to the pages actually read. One research is
// one unit of the "research" budget, however many turns it takes.
import type { LlmBudget } from "../llm/budget";
import type { LlmClient } from "../llm/client";
import { LlmOutputError, LlmUnavailableError } from "../llm/errors";
import { READ_PAGE_TOOL, type ResearchClient, type ResearchTools } from "../llm/research-client";
import { groundCompanyProfile, isEmptyProfile, type GroundResult } from "./ground";
import {
  RESEARCH_FINAL_SYSTEM,
  RESEARCH_SYSTEM,
  buildResearchFinalPrompt,
  buildResearchPrompt,
  type ResearchTarget,
} from "./prompt";
import { companyProfileSchema, type CompanyProfile } from "./schema";

export * from "./schema";
export * from "./ground";
export * from "./prompt";
export * from "./urls";

export const RESEARCH_TIMEOUT_MS = 120_000;
/** Text of each read page given to the tool-less final call. */
const FINAL_PAGE_CHARS = 6_000;
const FINAL_TOTAL_CHARS = 60_000;

export class ResearchFailedError extends Error {
  override readonly name = "ResearchFailedError";
}

export interface ResearchDeps {
  research: ResearchClient;
  /** Locked-down client for the tool-less final call. */
  client: LlmClient;
  budget?: LlmBudget | undefined;
}

export interface ResearchInput {
  model: string;
  target: ResearchTarget;
  tools: ResearchTools;
  /** The reader's normalized read-URL set for this research. */
  readUrls: ReadonlySet<string>;
  timeoutMs?: number;
  now?: () => Date;
}

export interface ResearchOutcome {
  status: "done" | "partial";
  profile: CompanyProfile;
  dropped: GroundResult["dropped"];
  model: string;
  pagesRead: number;
  /** Web search was tried and every search failed: research ran on read_page alone. */
  webSearchUnavailable: boolean;
  durationMs: number;
}

function isAbort(err: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))
  );
}

export async function researchCompany(
  deps: ResearchDeps,
  input: ResearchInput,
): Promise<ResearchOutcome> {
  const now = input.now ?? (() => new Date());
  deps.budget?.assertAvailable("research");
  const started = Date.now();
  const pages: { url: string; text: string }[] = [];
  const tools: ResearchTools = {
    readPage: async (url) => {
      const text = await input.tools.readPage(url);
      pages.push({ url, text });
      return text;
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? RESEARCH_TIMEOUT_MS);

  let raw: unknown;
  let status: "done" | "partial" = "done";
  let webSearchUnavailable = false;
  let ok = false;
  try {
    try {
      const res = await deps.research.research(
        {
          kind: "research",
          model: input.model,
          system: RESEARCH_SYSTEM,
          prompt: buildResearchPrompt(input.target),
          schema: companyProfileSchema,
          schemaName: "company_profile",
          abortSignal: controller.signal,
        },
        tools,
      );
      raw = res.object;
      const searches = res.toolCalls.filter((c) => c.name === "WebSearch");
      webSearchUnavailable = searches.length > 0 && searches.every((c) => c.error);
      if (!companyProfileSchema.safeParse(raw).success) raw = null;
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      if (isAbort(err, controller.signal)) status = "partial";
      else if (!(err instanceof LlmOutputError)) throw err;
      raw = null;
    }

    if (raw === null) {
      // Timeout or unusable answer: one tool-less call over what was read (design D4).
      if (!pages.length) {
        throw new ResearchFailedError(
          status === "partial"
            ? "Timed out before any page could be read"
            : "The research agent returned no usable profile",
        );
      }
      let budget = FINAL_TOTAL_CHARS;
      const given = pages
        .filter((p) => !p.text.startsWith("Error"))
        .map((p) => {
          const text = p.text.slice(0, Math.min(FINAL_PAGE_CHARS, Math.max(0, budget)));
          budget -= text.length;
          return { url: p.url, text };
        })
        .filter((p) => p.text.length > 0);
      const res = await deps.client.generate({
        kind: "research",
        model: input.model,
        system: RESEARCH_FINAL_SYSTEM,
        prompt: buildResearchFinalPrompt(input.target, given),
        schema: companyProfileSchema,
        schemaName: "company_profile",
        abortSignal: AbortSignal.timeout(60_000),
      });
      const parsed = companyProfileSchema.safeParse(res.object);
      if (!parsed.success)
        throw new ResearchFailedError("The research agent returned no usable profile");
      raw = parsed.data;
    }
    ok = true;
  } finally {
    clearTimeout(timer);
    deps.budget?.record({
      kind: "research",
      model: input.model,
      ok,
      durationMs: Date.now() - started,
    });
  }

  const grounded = groundCompanyProfile(raw as CompanyProfile, input.readUrls, now());
  if (isEmptyProfile(grounded.profile) && status === "done" && grounded.dropped.length) {
    // Everything cited pages that were never read: nothing trustworthy came back.
    status = "partial";
  }
  return {
    status,
    profile: grounded.profile,
    dropped: grounded.dropped,
    model: input.model,
    pagesRead: input.readUrls.size,
    webSearchUnavailable,
    durationMs: Date.now() - started,
  };
}

export { READ_PAGE_TOOL };

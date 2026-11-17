// The company research agent's client (company-research spec, "Restricted research tools";
// design D1). The ONLY client with tools: web search and Job Radar's own read-only page
// reader. Everything else in `lockedDownSettings` is kept: no other built-in tools, no
// filesystem settings, no API key, no telemetry. `canUseTool` is the single gate (bare
// `allowedTools` entries would bypass it, see the task 1.1 spike in design.md).
import { Output, generateText, tool } from "ai";
import { createAiSdkMcpServer, createClaudeCode } from "ai-sdk-provider-claude-code";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { classifyLlmError, lockedDownSettings, type ClaudeCodeClientOptions } from "./claude-code";
import type { LlmRequest, LlmResponse } from "./client";

export const RESEARCH_MCP_SERVER = "jobradar";
export const READ_PAGE_TOOL = `mcp__${RESEARCH_MCP_SERVER}__read_page`;
export const RESEARCH_ALLOWED_TOOLS = ["WebSearch", READ_PAGE_TOOL] as const;
export const RESEARCH_MAX_TURNS = 16;

/** Host-side tools handed to one research run. */
export interface ResearchTools {
  /** Returns the page as text for the model; throws when the page is refused or unreadable. */
  readPage(url: string): Promise<string>;
}

export interface ResearchToolCall {
  name: string;
  error: boolean;
}

export interface ResearchResponse extends LlmResponse {
  toolCalls: ResearchToolCall[];
}

export interface ResearchClient {
  research<T>(request: LlmRequest<T>, tools: ResearchTools): Promise<ResearchResponse>;
}

type PermissionResult =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

/** Allows exactly the two research tools; denies everything else, whatever the CLI offers. */
export async function researchToolGate(
  name: string,
  input: Record<string, unknown>,
): Promise<PermissionResult> {
  return (RESEARCH_ALLOWED_TOOLS as readonly string[]).includes(name)
    ? { behavior: "allow", updatedInput: input }
    : { behavior: "deny", message: `Tool ${name} is not available to the research agent` };
}

/** Locked-down settings with only the research changes (design D1). */
export function researchSettings(
  cwd: string,
  mcpServer: unknown,
  options: ClaudeCodeClientOptions = {},
) {
  const base = lockedDownSettings(cwd, options);
  return {
    ...base,
    tools: ["WebSearch"],
    disallowedTools: base.disallowedTools.filter((t) => t !== "WebSearch"),
    mcpServers: { [RESEARCH_MCP_SERVER]: mcpServer },
    maxTurns: RESEARCH_MAX_TURNS,
    canUseTool: researchToolGate,
  };
}

/** The in-process MCP server with the single `read_page` tool. */
export function researchToolServer(tools: ResearchTools) {
  return createAiSdkMcpServer(RESEARCH_MCP_SERVER, {
    read_page: tool({
      description:
        "Read one public web page (GET, no login). Returns its title and text with links as [text](url). Local and private addresses are refused.",
      inputSchema: z.object({ url: z.string().max(2000) }),
      execute: async ({ url }: { url: string }) => tools.readPage(url),
    }),
  });
}

export function createResearchClient(options: ClaudeCodeClientOptions = {}): ResearchClient {
  const cwd = mkdtempSync(join(tmpdir(), "job-radar-research-"));
  return {
    async research<T>(req: LlmRequest<T>, tools: ResearchTools): Promise<ResearchResponse> {
      const started = Date.now();
      // A fresh MCP server per research, so one run's reader (and its read-URL set) never
      // serves another run.
      const provider = createClaudeCode({
        defaultSettings: researchSettings(cwd, researchToolServer(tools), options) as never,
      });
      try {
        const result = await generateText({
          model: provider(req.model),
          system: req.system,
          prompt: req.prompt,
          output: Output.object({ schema: req.schema, name: req.schemaName ?? "result" }),
          abortSignal: req.abortSignal ?? AbortSignal.timeout(options.timeoutMs ?? 120_000),
        });
        const toolCalls: ResearchToolCall[] = result.steps.flatMap((s) =>
          s.content
            .filter((c) => c.type === "tool-result" || c.type === "tool-error")
            .map((c) => ({
              name: (c as { toolName: string }).toolName,
              error: c.type === "tool-error",
            })),
        );
        return {
          object: result.output,
          model: req.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          durationMs: Date.now() - started,
          toolCalls,
        };
      } catch (err) {
        return classifyLlmError(err);
      }
    },
  };
}

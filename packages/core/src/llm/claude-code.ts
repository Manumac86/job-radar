// LLM access through the owner's Claude subscription via the local Claude Code CLI
// (design D3). No Anthropic API key: API-key variables are removed from the CLI's env.
import { NoObjectGeneratedError, NoOutputGeneratedError, Output, generateText } from "ai";
import { createClaudeCode, isAuthenticationError } from "ai-sdk-provider-claude-code";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LlmClient, LlmRequest, LlmResponse } from "./client";
import { LlmOutputError, LlmUnavailableError, NOT_AUTHENTICATED_HELP } from "./errors";

/** Built-in tools explicitly denied as a second layer behind `tools: []`. */
const DENIED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "LS",
  "WebFetch",
  "WebSearch",
  "Task",
  "Agent",
  "TodoWrite",
  "Skill",
  "SlashCommand",
];

export interface ClaudeCodeClientOptions {
  /** OAuth token from `claude setup-token` (Docker). Natively the CLI's own login is used. */
  oauthToken?: string | undefined;
  /** Path to a specific `claude` executable. */
  executable?: string | undefined;
  timeoutMs?: number;
}

export function lockedDownSettings(cwd: string, options: ClaudeCodeClientOptions = {}) {
  return {
    // No tools, no MCP, no filesystem settings, no permission bypass (design D3).
    tools: [] as string[],
    disallowedTools: DENIED_TOOLS,
    mcpServers: {},
    strictMcpConfig: true,
    permissionMode: "default" as const,
    cwd,
    maxTurns: 3,
    env: {
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      ANTHROPIC_BASE_URL: undefined,
      CLAUDE_CODE_OAUTH_TOKEN: options.oauthToken ?? process.env["CLAUDE_CODE_OAUTH_TOKEN"],
      // Local-only: no telemetry, error reporting or other non-essential traffic from the CLI.
      DISABLE_TELEMETRY: "1",
      DISABLE_ERROR_REPORTING: "1",
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    },
    ...(options.executable ? { pathToClaudeCodeExecutable: options.executable } : {}),
  };
}

export function classifyLlmError(err: unknown): never {
  if (NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err)) {
    throw new LlmOutputError(`No valid structured output: ${err.message}`, 1);
  }
  if (isAuthenticationError(err)) {
    throw new LlmUnavailableError(NOT_AUTHENTICATED_HELP, "not_authenticated");
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/ENOENT|not found|spawn/i.test(message) && /claude/i.test(message)) {
    throw new LlmUnavailableError(`Claude Code CLI not found: ${message}`, "cli_missing");
  }
  if (/log ?in|authenticat|unauthori[sz]ed|invalid api key|oauth/i.test(message)) {
    throw new LlmUnavailableError(NOT_AUTHENTICATED_HELP, "not_authenticated");
  }
  throw err;
}

export function createClaudeCodeClient(options: ClaudeCodeClientOptions = {}): LlmClient {
  const cwd = mkdtempSync(join(tmpdir(), "job-radar-llm-"));
  const provider = createClaudeCode({ defaultSettings: lockedDownSettings(cwd, options) });
  return {
    async generate<T>(req: LlmRequest<T>): Promise<LlmResponse> {
      const started = Date.now();
      const signal = req.abortSignal ?? AbortSignal.timeout(options.timeoutMs ?? 180_000);
      try {
        const result = await generateText({
          model: provider(req.model),
          system: req.system,
          prompt: req.prompt,
          output: Output.object({ schema: req.schema, name: req.schemaName ?? "result" }),
          abortSignal: signal,
        });
        return {
          object: result.output,
          model: req.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          durationMs: Date.now() - started,
        };
      } catch (err) {
        return classifyLlmError(err);
      }
    },
  };
}

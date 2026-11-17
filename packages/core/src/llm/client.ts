import type { z } from "zod";
import type { LlmKind } from "./errors";

export interface LlmRequest<T> {
  kind: LlmKind;
  /** Model alias or id, e.g. "haiku" or "sonnet" (from Settings). */
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Shown to the model as the output's name, helps structured output. */
  schemaName?: string;
  abortSignal?: AbortSignal;
}

export interface LlmResponse {
  /** Unvalidated object as returned by the provider; callers validate with zod. */
  object: unknown;
  model: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  durationMs: number;
}

/** The single seam to the model. Swapping providers touches only an implementation of this. */
export interface LlmClient {
  generate<T>(request: LlmRequest<T>): Promise<LlmResponse>;
}

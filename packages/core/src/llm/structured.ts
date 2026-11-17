import type { z } from "zod";
import type { LlmBudget } from "./budget";
import type { LlmClient, LlmRequest } from "./client";
import { LlmOutputError, LlmUnavailableError } from "./errors";

export interface StructuredDeps {
  client: LlmClient;
  budget?: LlmBudget | undefined;
}

export interface StructuredResult<T> {
  value: T;
  model: string;
  attempts: number;
}

function describe(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * One budgeted, schema-validated model call with a single corrective retry (design D3,
 * job-scoring spec). Every attempt is counted against the daily cap.
 */
export async function callStructured<T>(
  deps: StructuredDeps,
  request: LlmRequest<T>,
): Promise<StructuredResult<T>> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    deps.budget?.assertAvailable(request.kind);
    const prompt =
      attempt === 1
        ? request.prompt
        : `${request.prompt}\n\nYour previous answer was rejected: ${lastError}\nReturn only a JSON object that matches the schema exactly, with no extra fields.`;
    let raw: unknown;
    const started = Date.now();
    try {
      const res = await deps.client.generate({ ...request, prompt });
      raw = res.object;
      deps.budget?.record({
        kind: request.kind,
        model: res.model,
        ok: true,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        durationMs: res.durationMs,
      });
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      deps.budget?.record({
        kind: request.kind,
        model: request.model,
        ok: false,
        durationMs: Date.now() - started,
      });
      if (err instanceof LlmOutputError) {
        lastError = err.message;
        continue;
      }
      throw err;
    }
    const parsed = request.schema.safeParse(raw);
    if (parsed.success) return { value: parsed.data, model: request.model, attempts: attempt };
    lastError = describe(parsed.error);
  }
  throw new LlmOutputError(`Model output failed validation twice: ${lastError}`, 2);
}

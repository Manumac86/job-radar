// pnpm llm:smoke — one tiny structured call through the local Claude Code CLI.
// Prints a schema-valid object when logged in, or a clear "not authenticated" message.
import { z } from "zod";
import { LlmUnavailableError, callStructured, createClaudeCodeClient } from "../src/index";

const schema = z
  .object({ ok: z.boolean(), capital_of_spain: z.string(), sum: z.number().int() })
  .strict();

const model = process.argv[2] ?? "haiku";
try {
  const res = await callStructured(
    { client: createClaudeCodeClient({ timeoutMs: 120_000 }) },
    {
      kind: "scoring",
      model,
      system: "Answer only with the requested JSON object.",
      prompt: "Set ok to true, give the capital of Spain, and compute 19 + 23.",
      schema,
      schemaName: "smoke",
    },
  );
  console.log(JSON.stringify({ model: res.model, attempts: res.attempts, value: res.value }));
} catch (err) {
  if (err instanceof LlmUnavailableError) {
    console.error(`LLM unavailable (${err.reason}): ${err.message}`);
    process.exit(3);
  }
  console.error(err);
  process.exit(1);
}

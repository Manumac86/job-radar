// pnpm draft:sample [source-type] — live: ingest a source into a temp DB and draft one offer.
import { LlmBudget, MemoryUsageStore, createClaudeCodeClient } from "@job-radar/core";
import { dataDir, listOffers, openDatabase, upsertSource } from "@job-radar/db";
import { adapters } from "@job-radar/sources";
import { config } from "../src/config";
import { DraftService } from "../src/drafts/service";
import { executeRun } from "../src/ingest/runner";
import { Notifier } from "../src/notifier";
import { ProfileService } from "../src/profile-service";

const type = process.argv[2] ?? "ycombinator";
const match = process.argv[3];
const db = openDatabase({ path: ":memory:" });
const profile = new ProfileService(db, config.profileDir);
profile.reload();
upsertSource(db, { id: type, type: type as never, name: type, enabled: true });
await executeRun(
  { db, profile, notifier: new Notifier(db), dataDir: dataDir(), adapters },
  type,
  "manual",
);
const offers = listOffers(db, { triage: ["new"], limit: 200 }).rows;
const offer =
  offers.find(
    (o) => !match || `${o.companyName} ${o.title}`.toLowerCase().includes(match.toLowerCase()),
  ) ?? offers[0]!;
const drafts = new DraftService({
  db,
  profile,
  client: createClaudeCodeClient(),
  budget: new LlmBudget(new MemoryUsageStore(), () => ({ scoring: 0, drafts: 2 })),
});
const started = Date.now();
const d = await drafts.generate(offer.id);
console.log(
  `${offer.companyName} — ${offer.title} (${Math.round((Date.now() - started) / 1000)}s, ${d.model})\n`,
);
console.log(d.message, "\n");
for (const a of d.screeningAnswers) console.log(`Q: ${a.question}\nA: ${a.answer}\n`);
console.log("Suggested rate:", JSON.stringify(d.suggestedRate));
console.log("Verify before sending:\n" + d.verifyBeforeSending.map((v) => `  - ${v}`).join("\n"));

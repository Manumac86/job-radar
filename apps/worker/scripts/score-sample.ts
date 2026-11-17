// pnpm score:sample <source-type> [n] — live: ingest a source into a temp DB and score n offers.
import { LlmBudget, MemoryUsageStore, createClaudeCodeClient } from "@job-radar/core";
import {
  dataDir,
  getOffer,
  listOffers,
  openDatabase,
  scoreHistory,
  upsertSource,
} from "@job-radar/db";
import { adapters } from "@job-radar/sources";
import { config } from "../src/config";
import { executeRun } from "../src/ingest/runner";
import { Notifier } from "../src/notifier";
import { ProfileService } from "../src/profile-service";
import { ScoringService } from "../src/scoring/service";

const type = process.argv[2] ?? "ycombinator";
const n = Number(process.argv[3] ?? 3);
const db = openDatabase({ path: ":memory:" });
const profile = new ProfileService(db, config.profileDir);
profile.reload();
upsertSource(db, { id: type, type: type as never, name: type, enabled: true });
const notifier = new Notifier(db);
await executeRun({ db, profile, notifier, dataDir: dataDir(), adapters }, type, "manual");
const ids = listOffers(db, { triage: ["new"], sort: "created", limit: n }).rows.map((o) => o.id);
const budget = new LlmBudget(new MemoryUsageStore(), () => ({ scoring: n * 2, drafts: 0 }));
const scoring = new ScoringService({
  db,
  profile,
  client: createClaudeCodeClient(),
  budget,
  notifier,
});
const started = Date.now();
scoring.enqueue(ids);
await scoring.idle();
for (const id of ids) {
  const o = getOffer(db, id)!;
  const s = scoreHistory(db, id)[0];
  console.log(
    `\n${o.companyName} — ${o.title}\n  location: ${o.location}\n  status: ${o.scoreStatus}${o.scoreError ? ` (${o.scoreError})` : ""}`,
  );
  if (s) {
    console.log(
      `  score ${s.overall} (${s.scoreClass}; model said ${s.modelOverall}) skills ${s.skillsFit} seniority ${s.seniorityFit} rate ${s.rateFit} location ${s.locationFit} engagement ${s.engagementFit}`,
    );
    console.log(
      `  service lines: ${s.serviceLines.join(", ") || "-"}; leadership: ${s.isLeadership}`,
    );
    console.log(`  red flags: ${s.redFlags.join("; ") || "-"}`);
    console.log(`  rationale: ${s.rationale}`);
  }
}
console.log(
  `\n${ids.length} offers in ${Math.round((Date.now() - started) / 1000)}s; LLM calls: ${budget.used("scoring")}`,
);

// pnpm source:dry-run <type> — fetches a source live and prints counts, writing nothing to data/.
import { openDatabase, listOffers, upsertSource, dataDir } from "@job-radar/db";
import { adapters } from "@job-radar/sources";
import { executeRun } from "../src/ingest/runner";
import { syncSources } from "../src/ingest/sources-sync";
import { Notifier } from "../src/notifier";
import { ProfileService } from "../src/profile-service";
import { config } from "../src/config";
import "../src/adapters-all";

const type = process.argv[2];
if (!type || !adapters[type]) {
  console.error(`Usage: pnpm source:dry-run <${Object.keys(adapters).join("|")}>`);
  process.exit(2);
}
const db = openDatabase({ path: ":memory:" });
const profile = new ProfileService(db, config.profileDir);
const status = profile.reload();
if (status.status !== "ok") {
  console.error(`Profile ${status.status}:\n${status.errors.join("\n")}`);
  process.exit(1);
}
syncSources(db, adapters, profile.get()?.preferences ?? null);
upsertSource(db, { id: type, type: type as never, name: type, enabled: true });
const outcome = await executeRun(
  { db, profile, notifier: new Notifier(db), dataDir: dataDir(), adapters },
  type,
  "manual",
);
if (outcome.status !== "finished") throw new Error(outcome.status);
const run = outcome.run;
for (const line of run.log) console.log(`  ${line}`);
console.log(
  `\n${type}: status ${run.status}, found ${run.found}, new ${run.newCount}, filtered ${run.filtered}, duplicates ${run.duplicates}`,
);
const kept = listOffers(db, { triage: ["new"], sort: "posted", limit: 15 }).rows;
console.log(
  `\nPassed the pre-filter (${listOffers(db, { triage: ["new"] }).total}), newest first:`,
);
for (const o of kept) console.log(`  - ${o.companyName}: ${o.title} [${o.location ?? "?"}]`);
if (run.error) console.log(`\nError: ${run.error}`);

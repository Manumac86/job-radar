// Fails when the repo could leak off this machine (design D11, local-operation spec).
import { checkLocal } from "./lib/local-guard.ts";

const result = checkLocal(process.cwd());
if (!result.ok) {
  console.error("check:local failed:");
  for (const problem of result.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  "check:local ok: remotes allowed (private checkout: public only), Turborepo and Next.js telemetry off, no remote cache, desktop app unpublished and localhost-only",
);

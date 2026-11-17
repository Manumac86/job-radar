// Versioned pre-push hook body (local-operation spec, "No git remotes"). In the owner's private
// checkout it allows only `public` → `main` on the public remote, never the private history, and
// reruns the privacy scan. Elsewhere it allows every push.
import { readFileSync } from "node:fs";
import { parsePushUpdates, pushProblems } from "./lib/publish.ts";

const [remoteName = "", remoteUrl = ""] = process.argv.slice(2);
const problems = pushProblems(
  process.cwd(),
  remoteName,
  remoteUrl,
  parsePushUpdates(readFileSync(0, "utf8")),
);
if (problems.length) {
  console.error("pre-push: push refused:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

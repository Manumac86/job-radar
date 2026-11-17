// `pnpm publish:sync [message]`: adds the current HEAD tree to the `public` branch as one new
// commit, after the privacy scan (public-release design D1, D3). Pushing stays a separate step:
//   git push public public:main
import { execFileSync } from "node:child_process";
import { isPrivateCheckout, publishSync } from "./lib/publish.ts";

const cwd = process.cwd();
if (!isPrivateCheckout(cwd)) {
  console.error(
    "publish:sync runs only in the owner's private checkout (git config jobradar.private true).",
  );
  process.exit(1);
}
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim();
if (dirty) console.warn("publish:sync: uncommitted changes are not published (only HEAD is).");

const message =
  process.argv.slice(2).join(" ") || `Update ${new Date().toISOString().slice(0, 10)}`;
const result = publishSync(cwd, message);
if (!result.ok) {
  console.error("publish:sync refused:");
  for (const p of result.problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  result.unchanged
    ? `publish:sync: nothing new; public is at ${result.commit.slice(0, 7)}`
    : `publish:sync: public is now ${result.commit.slice(0, 7)}. Push it with: git push public public:main`,
);

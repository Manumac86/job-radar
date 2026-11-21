// simpleapply-source task 3.1: captures one dashboard load (the /api/jobs JSON bodies the page
// itself requests) from the isolated browser profile, to learn the field names before the adapter
// is written. Read-only: no clicks, no requests of our own. The output stays in data/ (git-ignored).
//
//   pnpm --filter @job-radar/worker exec tsx scripts/simpleapply-capture.ts --login   # first time (close the window when logged in)
//   pnpm --filter @job-radar/worker exec tsx scripts/simpleapply-capture.ts
import { dataDir } from "@job-radar/db";
import {
  BrowserSessions,
  SIMPLEAPPLY_DASHBOARD,
  SIMPLEAPPLY_JOBS_PATH,
  SIMPLEAPPLY_SITE,
  chooseBrowser,
  defaultProfileDir,
} from "@job-radar/sources";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const data = dataDir();
const browser = new BrowserSessions({
  profileDir: defaultProfileDir(data),
  viewer: "window",
  browser: chooseBrowser(process.env["JOB_RADAR_BROWSER"]),
  log: (msg) => console.log(msg),
});

if (process.argv.includes("--login")) {
  await browser.startLogin(SIMPLEAPPLY_SITE);
  console.log("Log in to SimpleApply in the Chrome window that opened, then CLOSE that window.");
  // `!` commands get no keyboard input: wait until the isolated Chrome has exited (10 min max).
  const profile = defaultProfileDir(data);
  const running = () =>
    execFileSync("ps", ["-axo", "command"], { encoding: "utf8" })
      .split("\n")
      .some((l) => l.includes(profile) && !l.includes("simpleapply-capture"));
  const deadline = Date.now() + 10 * 60_000;
  await wait(3000);
  while (running() && Date.now() < deadline) await wait(2000);
  await browser.finishLogin();
  await wait(1500);
}

const out = await browser.withSite(SIMPLEAPPLY_SITE, async (page) => {
  await page.goto(SIMPLEAPPLY_DASHBOARD);
  await wait(8000);
  let lists = (await page.jsonResponses(SIMPLEAPPLY_JOBS_PATH)).length;
  const scrolls: number[] = [];
  for (let i = 0; i < 6; i++) {
    await page.scroll();
    await wait(3000);
    const now = (await page.jsonResponses(SIMPLEAPPLY_JOBS_PATH)).length;
    scrolls.push(now - lists);
    if (now === lists) break;
    lists = now;
  }
  return {
    finalUrl: page.url(),
    scrolls,
    responses: await page.jsonResponses(SIMPLEAPPLY_JOBS_PATH),
  };
});

const file = join(data, "simpleapply-capture.json");
writeFileSync(file, JSON.stringify(out, null, 2), { mode: 0o600 });
console.log(`final URL: ${out.finalUrl}`);
console.log(`new /api/jobs responses after each scroll: ${JSON.stringify(out.scrolls)}`);
for (const r of out.responses) {
  const body = r.body as Record<string, unknown> | null;
  console.log(
    `${r.status} ${r.url} → keys: ${body && typeof body === "object" ? Object.keys(body).join(", ") : typeof body}`,
  );
}
console.log(`Saved to ${file}`);

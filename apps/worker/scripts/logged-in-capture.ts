// Debug: loads one search page of a logged-in site from the isolated profile (headless, like a
// run) and saves its HTML plus the page's own same-origin JSON responses, to see why a run reads
// nothing. Read-only: no clicks, no requests of our own. Output stays in data/ (git-ignored).
//
//   JOB_RADAR_PROFILE_DIR=<profile> pnpm --filter @job-radar/worker exec tsx scripts/logged-in-capture.ts <site> [url]
import { dataDir } from "@job-radar/db";
import {
  BrowserSessions,
  LOGGED_IN_SITES,
  chooseBrowser,
  defaultProfileDir,
} from "@job-radar/sources";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const data = dataDir();
const id = process.argv[2] ?? "linkedin";
const adHocUrl = process.argv[3];
// An unknown site with a URL: a one-off look at a site that has no adapter yet.
const site =
  LOGGED_IN_SITES[id] ??
  (adHocUrl
    ? {
        ...LOGGED_IN_SITES["linkedin"]!,
        id,
        label: id,
        loginUrl: adHocUrl,
        checkUrl: adHocUrl,
        loginUrlPattern: /\/(login|sign-?in|auth)\b/i,
        searchUrls: () => [adHocUrl],
      }
    : undefined);
if (!site) throw new Error(`Unknown site ${id}: ${Object.keys(LOGGED_IN_SITES).join(", ")}`);
const browser = new BrowserSessions({
  profileDir: process.env["JOB_RADAR_PROFILE_DIR"] ?? defaultProfileDir(data),
  headless: true,
  browser: chooseBrowser(process.env["JOB_RADAR_BROWSER"]),
  log: (msg) => console.log(msg),
});

const url = site.searchUrls(["AI Engineer"])[0]!;
const out = await browser.withSite(site, async (page) => {
  await page.goto(url);
  const early = await page.html();
  await wait(10_000);
  await page.scroll();
  await wait(3000);
  return {
    finalUrl: page.url(),
    early,
    late: await page.html(),
    json: await page.jsonResponses(/.*/),
  };
});

writeFileSync(join(data, `${id}-capture-early.html`), out.early, { mode: 0o600 });
writeFileSync(join(data, `${id}-capture-late.html`), out.late, { mode: 0o600 });
writeFileSync(join(data, `${id}-capture.json`), JSON.stringify(out.json, null, 2), { mode: 0o600 });
console.log(`final URL: ${out.finalUrl}`);
console.log(`early ${out.early.length} chars, late ${out.late.length} chars`);
for (const r of out.json) console.log(`${r.status} ${r.url.slice(0, 160)}`);

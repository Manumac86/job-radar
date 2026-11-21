import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ForbiddenActionError,
  PageBudget,
  PageCapReachedError,
  assertSafeLabel,
  readOnlyPage,
} from "../src/browser/guard";

const PAGE = `<!doctype html><html><body>
  <h1>Senior AI Engineer</h1>
  <button id="apply">Apply now</button>
  <a id="easy" role="button" aria-label="Easy Apply to Senior AI Engineer">⚡</a>
  <button id="proposal">Send proposal</button>
  <button id="connect"><span>Connect</span></button>
  <button id="next">Next</button>
  <button id="more">Show more</button>
  <button id="sneaky">Next — apply</button>
</body></html>`;
const url = (n: number) =>
  `data:text/html,${encodeURIComponent(PAGE.replace("<h1>", `<h1 data-n="${n}">`))}`;

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});

async function setup(cap = 20) {
  const page = await browser.newPage();
  const sleeps: number[] = [];
  const ro = readOnlyPage(page, {
    site: "upwork",
    budget: new PageBudget(cap),
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { page, ro, sleeps };
}

describe("read-only guard", () => {
  it("throws on apply, send, connect and similar controls, and never clicks them", async () => {
    const { page, ro } = await setup();
    await ro.goto(url(1));
    let clicks = 0;
    await page.exposeBinding("track", () => void clicks++);
    await page.evaluate(
      "document.querySelectorAll('button,a').forEach((b) => b.addEventListener('click', () => window.track()))",
    );
    for (const sel of ["#apply", "#easy", "#proposal", "#connect", "#sneaky"]) {
      await expect(ro.safeClick(sel)).rejects.toBeInstanceOf(ForbiddenActionError);
    }
    await expect(ro.safeClick("#apply")).rejects.toThrow(/Blocked a click on "Apply now"/);
    expect(clicks).toBe(0);
    await ro.safeClick("#next");
    await ro.safeClick("#more");
    expect(clicks).toBe(2);
    await page.close();
  });

  it("only allows pagination and show-more labels", () => {
    for (const ok of ["Next", "Show more", "Load more", "2", "»", "Siguiente"])
      expect(() => assertSafeLabel(ok)).not.toThrow();
    for (const bad of [
      "Apply",
      "Submit application",
      "Message recruiter",
      "Follow",
      "Save job",
      "Postular",
      "",
      "Delete account",
    ]) {
      expect(() => assertSafeLabel(bad)).toThrow(ForbiddenActionError);
    }
  });

  it("refuses MyGreenhouse's quick apply, dream job and withdraw controls (mygreenhouse-source)", () => {
    for (const bad of ["Quick apply", "Dream job", "Mark as dream job", "Withdraw application"]) {
      expect(() => assertSafeLabel(bad)).toThrow(ForbiddenActionError);
    }
    expect(() => assertSafeLabel("Next page")).not.toThrow();
  });

  it("caps page views per site per hour and waits at least 5 s between pages", async () => {
    const { page, ro, sleeps } = await setup(2);
    await ro.goto(url(1));
    await ro.goto(url(2));
    await expect(ro.goto(url(3))).rejects.toBeInstanceOf(PageCapReachedError);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(5000);
    expect(sleeps[0]).toBeLessThanOrEqual(20000);
    expect(ro.pagesViewed).toBe(2);
    await page.close();
  });

  it("resets the cap after an hour", () => {
    let now = 0;
    const budget = new PageBudget(1, () => now);
    budget.take("linkedin");
    expect(() => budget.take("linkedin")).toThrow(PageCapReachedError);
    expect(() => budget.take("malt")).not.toThrow();
    now = 3_600_001;
    expect(() => budget.take("linkedin")).not.toThrow();
  });
});

describe("jsonResponses", () => {
  const DASH = `<!doctype html><html><body>
    <button id="simple">⚡ Simple Apply 1 cr</button>
    <button id="applied">Applied</button>
    <button id="unlock">Unlock with Premium</button>
    <button id="auto" aria-label="Full Auto Apply">●</button>
    <script>
      fetch("/api/jobs?page=1&status=not-applied", { headers: { authorization: "Bearer SECRET-TOKEN" } });
      fetch("/api/credits");
      fetch("/api/text");
      fetch("https://cdn.other.test/data.json").catch(() => {});
    </script></body></html>`;

  async function dashboard() {
    const page = await browser.newPage();
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === "cdn.other.test")
        return route.fulfill({ contentType: "application/json", body: '{"third":true}' });
      if (u.pathname === "/dashboard" || u.pathname === "/other")
        return route.fulfill({ contentType: "text/html", body: DASH });
      if (u.pathname === "/api/jobs")
        return route.fulfill({
          contentType: "application/json; charset=utf-8",
          headers: { "set-cookie": "sid=SECRET-COOKIE" },
          body: JSON.stringify({ jobs: [{ title: "Engineer" }] }),
        });
      if (u.pathname === "/api/credits")
        return route.fulfill({ contentType: "application/json", body: '{"credits":30}' });
      return route.fulfill({ contentType: "text/plain", body: "plain" });
    });
    const ro = readOnlyPage(page, {
      site: "simpleapply",
      budget: new PageBudget(20),
      sleep: async () => {},
    });
    return { page, ro };
  }

  it("returns same-origin JSON bodies only, never headers, and resets on navigation", async () => {
    const { page, ro } = await dashboard();
    await ro.goto("https://simpleapply.test/dashboard");
    await page.waitForLoadState("networkidle");
    const jobs = await ro.jsonResponses(/^\/api\/jobs$/);
    expect(jobs).toEqual([
      {
        url: "/api/jobs?page=1&status=not-applied",
        status: 200,
        body: { jobs: [{ title: "Engineer" }] },
      },
    ]);
    const all = await ro.jsonResponses(/./);
    expect(all.map((r) => r.url).sort()).toEqual([
      "/api/credits",
      "/api/jobs?page=1&status=not-applied",
    ]);
    expect(JSON.stringify(all)).not.toMatch(/SECRET|third/);

    await page.unroute("**/*");
    await page.route("**/*", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>x</p>" }),
    );
    await ro.goto("https://simpleapply.test/other");
    expect(await ro.jsonResponses(/./)).toEqual([]);
    await page.close();
  });

  it("refuses SimpleApply's apply, applied, unlock and auto-apply controls", async () => {
    const { page, ro } = await dashboard();
    await ro.goto("https://simpleapply.test/dashboard");
    for (const sel of ["#simple", "#applied", "#unlock", "#auto"])
      await expect(ro.safeClick(sel)).rejects.toBeInstanceOf(ForbiddenActionError);
    await page.close();
  });
});

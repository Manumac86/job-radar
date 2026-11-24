import { expect, test, type Locator, type Page } from "@playwright/test";

// Phone width (390 px, touch), as the owner uses Job Radar over Tailscale (job-dashboard spec,
// design D8). Runs in the `phone` project, after the desktop tests, so it picks its people and
// cards from whatever the seeded data looks like by then.

const WIDTH = 390;

/** With a mobile viewport, a page that overflows widens the layout instead of clipping. */
async function pageWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test("no main screen scrolls sideways at 390 px", async ({ page }) => {
  await page.goto("/offers");
  const offer = await page.locator('a[href^="/offers/"]').first().getAttribute("href");
  const routes = ["/", "/offers", offer!, "/pipeline", "/people", "/sources", "/notifications"];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    expect(await pageWidth(page), route).toBeLessThanOrEqual(WIDTH);
  }
});

test("Settings fits at 390 px, even with a target role longer than the screen", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  expect(await pageWidth(page)).toBeLessThanOrEqual(WIDTH);
  const roles = page.getByLabel("Target roles", { exact: true });
  await roles.fill("Principal staff platform engineer for applied machine learning infrastructure");
  await roles.press("Enter");
  await expect(
    page.getByRole("button", { name: /^Remove Principal staff platform/ }),
  ).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(WIDTH);
});

test("People: each person is a stacked entry whose actions fit on screen", async ({ page }) => {
  await page.goto("/people");
  const entry = page.getByTestId("people-entry").first();
  await expect(entry).toBeVisible();
  await expect(page.getByTestId("people-row").first()).toBeHidden();
  const edit = entry.getByRole("button", { name: /^Edit / });
  const name = (await edit.getAttribute("aria-label"))!.replace(/^Edit /, "");
  for (const action of ["Edit", "Merge", "Delete"]) {
    const box = (await entry.getByRole("button", { name: `${action} ${name}` }).boundingBox())!;
    expect(box.x + box.width, action).toBeLessThanOrEqual(WIDTH);
  }
  await edit.tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Name")).toHaveValue(name);
});

/** Raw touch events through CDP: Playwright's touchscreen only taps. */
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  const center = async (l: Locator) => {
    // At phone width the board can start below the fold; touches must land on screen.
    await l.scrollIntoViewIfNeeded();
    const b = (await l.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  return {
    center,
    async gesture(
      from: { x: number; y: number },
      to: { x: number; y: number },
      {
        holdMs = 0,
        steps = 10,
        stepMs = 16,
        midway,
      }: { holdMs?: number; steps?: number; stepMs?: number; midway?: () => Promise<void> } = {},
    ) {
      await send("touchStart", from.x, from.y);
      if (holdMs) await page.waitForTimeout(holdMs);
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await send("touchMove", x, y);
        await page.waitForTimeout(stepMs);
        if (midway && i === Math.ceil(steps / 2)) await midway();
      }
      await send("touchEnd");
    },
  };
}

/** The first column holding a card, the column after it, and that card. */
async function pickMove(page: Page) {
  const columns = page.locator('section[data-testid^="column-"]');
  const n = await columns.count();
  for (let i = 0; i < n - 1; i++) {
    const cards = columns.nth(i).getByTestId("pipeline-card");
    if (!(await cards.count())) continue;
    const company = (
      await cards.first().locator("button").nth(1).locator("div").first().innerText()
    ).trim();
    return {
      from: columns.nth(i),
      to: columns.nth(i + 1),
      fromLabel: await columns.nth(i).getAttribute("aria-label"),
      toLabel: await columns.nth(i + 1).getAttribute("aria-label"),
      company,
      card: (col: Locator) => col.getByTestId("pipeline-card").filter({ hasText: company }),
    };
  }
  throw new Error("No column with a card next to another column");
}

/** Scrolls the board so that a column starts at its left edge. */
async function scrollBoardTo(page: Page, column: Locator) {
  await page.getByTestId("pipeline-board").evaluate(
    (board, left) => {
      board.scrollLeft = left;
    },
    await column.evaluate((c) => (c as HTMLElement).offsetLeft),
  );
}

test("Pipeline: a sideways swipe that starts on a card scrolls the board and moves no card", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const move = await pickMove(page);
  await scrollBoardTo(page, move.from);
  const board = page.getByTestId("pipeline-board");
  const before = await board.evaluate((b) => b.scrollLeft);
  const t = await touch(page);
  // Start on the drag handle, the spot most likely to pick the card up.
  const start = await t.center(move.card(move.from).getByTestId("drag-handle"));
  await t.gesture(start, { x: start.x - 200, y: start.y });
  await page.waitForTimeout(300);
  expect(await board.evaluate((b) => b.scrollLeft)).toBeGreaterThan(before);
  await expect(move.card(move.from)).toBeVisible();
  await expect(page.getByText(`${move.company} → `)).toHaveCount(0);
});

test("Pipeline: press and hold, then drop on another column, changes the stage", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const move = await pickMove(page);
  await scrollBoardTo(page, move.from);
  const t = await touch(page);
  const start = await t.center(move.card(move.from));
  const target = (await move.to.boundingBox())!;
  await t.gesture(
    start,
    { x: Math.min(target.x + 60, WIDTH - 10), y: target.y + 80 },
    {
      holdMs: 400,
      steps: 15,
      // While it moves, the card is drawn above the columns, not inside its own (A-0046).
      midway: async () => {
        const overlay = page.getByTestId("drag-overlay");
        await expect(overlay).toBeVisible();
        expect(await overlay.evaluate((el) => !el.closest('section[data-testid^="column-"]'))).toBe(
          true,
        );
      },
    },
  );
  await expect(page.getByText(`${move.company} → ${move.toLabel}`)).toBeVisible();
  await expect(move.card(move.to)).toBeVisible();

  // The timeline records the move.
  await page.reload();
  await move
    .card(move.to)
    .getByRole("button", { name: new RegExp(`^${move.company}`) })
    .tap();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("link", { name: "open offer and timeline" }).tap();
  await expect(page.getByTestId("timeline")).toContainText(`${move.fromLabel} → ${move.toLabel}`);
});

test("Pipeline: a tap on a card opens it", async ({ page }) => {
  await page.goto("/pipeline");
  const move = await pickMove(page);
  await scrollBoardTo(page, move.from);
  await move
    .card(move.from)
    .getByRole("button", { name: new RegExp(`^${move.company}`) })
    .tap();
  await expect(page.getByRole("dialog").getByRole("heading", { name: move.company })).toBeVisible();
});

test("Sidebar: choosing a page closes it", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().tap();
  const sidebar = page.getByRole("dialog", { name: "Sidebar" });
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("link", { name: "Pipeline" }).tap();
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(sidebar).toBeHidden();
});

test("Back to offers returns to the filtered list", async ({ page }) => {
  await page.goto("/offers?class=strong");
  await page.getByRole("list", { name: "Offers" }).getByRole("link").first().tap();
  await expect(page).toHaveURL(/\/offers\/\d+\?list=/);
  await page.getByRole("link", { name: "Back to offers" }).tap();
  await expect(page).toHaveURL(/\/offers\?class=strong$/);
});

test("Settings: every tab fits at 390 px", async ({ page }) => {
  await page.goto("/settings");
  const tabs = page.getByRole("tab");
  const n = await tabs.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const tab = tabs.nth(i);
    const name = (await tab.innerText()).trim();
    await tab.tap();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await page.waitForLoadState("networkidle");
    expect(await pageWidth(page), name).toBeLessThanOrEqual(WIDTH);
  }
});

test("Offer detail: triage and copy draft work at 390 px", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/offers");
  const hrefs = await page
    .getByRole("list", { name: "Offers" })
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  // An offer that is still new; it gets a draft here if it has none (fake LLM in test mode), so
  // the test does not depend on what the desktop tests left behind.
  let found = false;
  for (const href of hrefs) {
    await page.goto(href);
    if (await page.getByRole("button", { name: "Shortlist" }).count()) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  const copy = page.getByRole("button", { name: "Copy draft" });
  if (!(await copy.isEnabled())) {
    await page.getByRole("button", { name: "Generate draft" }).tap();
    await expect(copy).toBeEnabled();
  }
  for (const name of ["Copy draft", "Shortlist", "Dismiss", "Mark as applied"]) {
    const box = (await page.getByRole("button", { name }).boundingBox())!;
    expect(box.x + box.width, name).toBeLessThanOrEqual(WIDTH);
  }
  await page.getByRole("button", { name: "Copy draft" }).tap();
  await expect(page.getByText(/^Draft v\d+ copied$/)).toBeVisible();
  await page.getByRole("button", { name: "Shortlist" }).tap();
  await expect(page.getByTestId("triage-state")).toHaveText("Shortlisted");
  await page.getByRole("button", { name: "Back to new" }).tap();
  await expect(page.getByRole("button", { name: "Shortlist" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const d = (await dialog.boundingBox())!;
  expect(d.x >= 0 && d.x + d.width <= WIDTH).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Offers list: the score never overlaps the title, even while awaiting a score", async ({
  page,
}) => {
  await page.goto("/offers?applied=1");
  const entries = page.getByRole("list", { name: "Offers" }).getByRole("listitem");
  const n = await entries.count();
  expect(n).toBeGreaterThan(3);
  await expect(page.getByRole("list", { name: "Offers" })).toContainText("Awaiting");
  for (let i = 0; i < n; i++) {
    const entry = entries.nth(i);
    const score = (await entry.locator("div").first().boundingBox())!;
    const scoreContent = await entry
      .locator("div")
      .first()
      .evaluate((el) => {
        const r = (el.firstElementChild ?? el).getBoundingClientRect();
        return r.right;
      });
    const title = (await entry.getByRole("link").first().boundingBox())!;
    expect(scoreContent, `entry ${i}`).toBeLessThanOrEqual(title.x);
    expect(score.x + score.width).toBeLessThanOrEqual(title.x);
  }
});

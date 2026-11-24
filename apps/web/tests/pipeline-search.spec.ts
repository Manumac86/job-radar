import { expect, test } from "@playwright/test";

// star-atlas-redesign: the pipeline is full width, searchable, and each column scrolls.

test("searching the pipeline keeps only matching cards, and Escape clears it", async ({ page }) => {
  await page.goto("/pipeline");
  const cards = page.getByTestId("pipeline-card");
  const total = await cards.count();
  expect(total).toBeGreaterThan(2);

  const search = page.getByLabel("Search pipeline");
  await search.fill("prosewáre"); // accents and case are ignored
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Proseware");
  await expect(page.getByRole("status").filter({ hasText: "applications" })).toHaveText(
    `1 of ${total} applications`,
  );

  await search.press("Escape");
  await expect(cards).toHaveCount(total);
});

test("the board spans the work area and each column scrolls on its own", async ({ page }) => {
  await page.goto("/pipeline");
  const board = page.getByTestId("pipeline-board");
  const main = page.getByTestId("page-content");
  const [boardBox, mainBox] = [await board.boundingBox(), await main.boundingBox()];
  // Full width: no centered max-width column around the board.
  expect(boardBox!.width).toBeGreaterThan(mainBox!.width - 100);
  expect(await board.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
  const column = page.getByTestId("column-scroll-applied");
  expect(await column.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
});

test("shift + wheel over a column scrolls the board sideways", async ({ page }) => {
  await page.goto("/pipeline");
  const board = page.getByTestId("pipeline-board");
  const scrollable = await board.evaluate((el) => el.scrollWidth > el.clientWidth);
  test.skip(!scrollable, "the board fits the viewport");
  await page.getByTestId("column-scroll-applied").hover();
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 400);
  await page.keyboard.up("Shift");
  await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

import { expect, test } from "@playwright/test";
import { pickDate, pickTime } from "./pickers";

test("drag a card to 'Technical interview' and add an interview", async ({ page }) => {
  await page.goto("/pipeline");
  const applied = page.getByTestId("column-applied");
  const technical = page.getByTestId("column-technical_interview");
  const card = applied.getByTestId("pipeline-card").filter({ hasText: "Contoso" });
  await expect(card).toBeVisible();

  // Drag with the pointer, the same way a person would.
  const handle = card.getByTestId("drag-handle");
  // Cards to review above the board can push it below the fold.
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await technical.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 });
  await page.mouse.up();

  await expect(technical.getByTestId("pipeline-card").filter({ hasText: "Contoso" })).toBeVisible();
  await expect(page.getByText("Contoso → Technical interview")).toBeVisible();
  await page.reload();
  await expect(technical.getByTestId("pipeline-card").filter({ hasText: "Contoso" })).toBeVisible();

  // Open the card and record the interview.
  await technical.getByRole("button", { name: /^Contoso/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Contoso" })).toBeVisible();
  await pickDate(page, sheet, "Interview date", "2030-03-12");
  await pickTime(page, sheet, "Interview time", "16:30");
  await sheet.getByLabel("Interviewers").fill("CTO, Staff Engineer");
  await sheet.getByLabel("Meeting link").fill("https://meet.example.invalid/xyz");
  await sheet.getByLabel("Prep notes").fill("System design: RAG pipeline");
  await sheet.getByRole("button", { name: "Add interview" }).click();
  await expect(page.getByText("Interview added")).toBeVisible();
  await expect(sheet.getByTestId("interview-list")).toContainText(
    "Technical · 12 Mar 2030, 16:30 CET",
  );
  await expect(sheet.getByTestId("interview-list")).toContainText("With CTO, Staff Engineer");

  // Interview prep for the technical round (generated automatically on the move, or on demand).
  await sheet.getByRole("button", { name: /^(Generate|Regenerate)$/ }).click();
  await expect(page.getByText("Interview prep ready")).toBeVisible();
  const prep = sheet.getByLabel("Interview prep");
  await expect(prep).toContainText("Walk us through a RAG system you built.");
  await expect(prep).toContainText("How do you measure retrieval quality?");

  // The move and the interview are on the offer timeline.
  await sheet.getByRole("link", { name: "open offer and timeline" }).click();
  await expect(page.getByTestId("timeline")).toContainText("Applied → Technical interview");
  await expect(page.getByTestId("timeline")).toContainText("Interview scheduled: technical");
});

test("a dragged card stays visible above the other columns; Escape cancels the move", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const columns = page.locator('section[data-testid^="column-"]');
  const from = columns.first();
  const to = columns.nth(1);
  const card = from.getByTestId("pipeline-card").first();
  const id = await card.getAttribute("data-application-id");
  const company = (await card.getByRole("button").nth(1).locator("div").first().innerText()).trim();
  const handle = card.getByTestId("drag-handle");
  await handle.scrollIntoViewIfNeeded();
  const h = (await handle.boundingBox())!;
  const t = (await to.boundingBox())!;
  const x = t.x + t.width / 2;
  const y = t.y + 80;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 20, h.y + 10, { steps: 5 });
  await page.mouse.move(x, y, { steps: 15 });

  // Over the other column, the card is drawn above it, not clipped by its own column.
  const overlay = page.getByTestId("drag-overlay");
  await expect(overlay).toBeVisible();
  const o = (await overlay.boundingBox())!;
  expect(o.x <= x && x <= o.x + o.width && o.y <= y && y <= o.y + o.height).toBe(true);
  expect(await overlay.evaluate((el) => !el.closest('section[data-testid^="column-"]'))).toBe(true);

  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(overlay).toHaveCount(0);
  await expect(from.locator(`[data-application-id="${id}"]`)).toBeVisible();
  await expect(page.getByText(`${company} → `)).toHaveCount(0);
});

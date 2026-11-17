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

import { expect, test } from "@playwright/test";

// MyGreenhouse status updates (mygreenhouse-source task 4.1), seeded in tests/seed.ts.

test("a MyGreenhouse suggestion is listed to review and applying it moves the application", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const card = page.getByTestId("updates-to-review");
  const entry = card.getByTestId("portal-entry");
  await expect(entry).toContainText("MyGreenhouse");
  await expect(entry).toContainText("Integrations Engineer at Fourth Coffee");
  await expect(entry).toContainText("Status: inactive → move to Rejected (by them)?");
  await expect(entry).toContainText("rejected, or the job closed");
  await entry.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Applied" })).toBeVisible();
  await expect(card.getByTestId("portal-entry")).toHaveCount(0);
  await expect(
    page
      .getByTestId("column-rejected")
      .getByRole("button", { name: "Fourth Coffee Integrations Engineer", exact: true }),
  ).toBeVisible();
});

test("an automatic move from MyGreenhouse shows in the sheet and the timeline, and Undo reverts it", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await page
    .getByTestId("column-rejected")
    .getByRole("button", { name: "Fourth Coffee Backend Engineer", exact: true })
    .click();
  const sheet = page.getByRole("dialog");
  const entry = sheet.getByTestId("application-updates").getByTestId("portal-entry");
  await expect(entry).toContainText("Updated automatically");
  await expect(entry).toContainText("Status: Rejected · moved to Rejected (by them)");
  await entry.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Undone" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByTestId("column-applied")
      .getByRole("button", { name: "Fourth Coffee Backend Engineer", exact: true }),
  ).toBeVisible();

  await page.goto("/offers?applied=1&q=Fourth");
  await page.getByRole("link", { name: "Backend Engineer", exact: true }).click();
  const timeline = page.getByTestId("timeline");
  await expect(timeline.getByTestId("portal-entry")).toContainText("Undone");
  await expect(timeline).toContainText("from MyGreenhouse");
  await expect(timeline).toContainText('Undid the MyGreenhouse update "Rejected"');
});

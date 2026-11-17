import { expect, test } from "@playwright/test";

test("'Delete browser profile' logs out every logged-in source", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Sessions" }).click();
  await expect(page.getByText("never passwords")).toBeVisible();
  await page.getByRole("button", { name: "Delete browser profile" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("logs you out of every site");
  await dialog.getByRole("button", { name: "Delete profile" }).click();
  await expect(page.getByText("Browser profile deleted: every site is logged out")).toBeVisible();
  await page.goto("/sources");
  await expect(page.getByTestId("source-upwork")).toContainText("Logged out");
});

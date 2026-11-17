import { expect, test } from "@playwright/test";

test("add an offer I applied to elsewhere, from its link and pasted text", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("button", { name: "Add from link" }).click();
  const dialog = page.getByRole("dialog");
  // A host that never resolves: the page cannot be read, so the pasted text is used.
  await dialog.getByLabel("Offer link").fill("https://jobs.example.invalid/founding-ai-engineer");
  await dialog.getByRole("button", { name: /Paste the offer text instead/ }).click();
  await dialog
    .getByLabel("Offer text (optional)")
    .fill("Imported Labs is hiring a Founding AI Engineer, remote in Europe. ".repeat(6));
  await expect(dialog.getByLabel("I already applied")).toBeChecked();
  await dialog.getByRole("button", { name: "Add offer" }).click();

  await expect(page.getByText("Offer added and marked as applied")).toBeVisible();
  await expect(page).toHaveURL(/\/offers\/\d+$/);
  await expect(page.getByRole("heading", { name: "Founding AI Engineer" })).toBeVisible();
  await page.goto("/pipeline");
  await expect(
    page
      .getByTestId("column-applied")
      .getByTestId("pipeline-card")
      .filter({ hasText: "Imported Labs" }),
  ).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";

async function dismiss(page: Page, title: string, reasons: string[], note: string) {
  await page.goto("/offers");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Dismiss" }).click();
  const dialog = page.getByRole("dialog");
  for (const r of reasons) await dialog.getByRole("button", { name: r }).click();
  await dialog.getByLabel("Note (optional)").fill(note);
  await dialog.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("triage-state")).toHaveText("Dismissed");
}

test("dismissals teach preferences the owner controls", async ({ page }) => {
  // Both state 90 EUR/h; the seed minimum is 65 EUR/h.
  await dismiss(page, "Blockchain Engineer", ["Salary too low", "Company or sector"], "crypto");
  await dismiss(page, "Web3 Backend Engineer", ["Salary too low", "Company or sector"], "web3");

  await page.goto("/settings");
  await page.getByRole("tab", { name: "Learning" }).click();
  const suggestions = page.getByTestId("rate-suggestions");
  await expect(async () => {
    await page.reload();
    await page.getByRole("tab", { name: "Learning" }).click();
    await expect(suggestions).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(suggestions).toContainText("Raise your minimum hourly rate to 90 EUR?");

  await page.getByRole("button", { name: "Learn now" }).click();
  await expect(page.getByText(/Learned from \d+ decisions: 1 new/)).toBeVisible();
  const learned = page.getByTestId("learned-preference");
  await expect(learned.first()).toContainText(
    "Avoid offers that require US W2 employment or US residency",
  );
  await expect(page.getByTestId("rescore-banner")).toBeVisible();

  await learned.first().getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Preference text").fill("Avoid offers that require US W2 employment");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(learned.first()).toContainText("Yours");
  await expect(learned.first()).toContainText("Avoid offers that require US W2 employment");

  await learned.first().getByRole("button", { name: "Disable" }).click();
  await expect(learned.first()).toHaveAttribute("data-status", "disabled");

  await suggestions.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Minimum hourly rate (EUR) set to 90")).toBeVisible();
  await expect(suggestions).toBeHidden();

  // Rescoring would change seeded scores other specs rely on; just hide the banner.
  await page.goto("/offers");
  const banner = page.getByTestId("rescore-banner");
  await expect(banner).toContainText("Learned preferences changed");
  await banner.getByRole("button", { name: "Not now" }).click();
  await expect(banner).toBeHidden();
});

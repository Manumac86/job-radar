import { expect, test } from "@playwright/test";

// The offer detail's "Back to offers" link (job-dashboard spec, "Back to the offers list").

test("Back to offers returns to the list with the filters that were applied", async ({ page }) => {
  await page.goto("/offers?class=strong&engagement=contract");
  await page.getByTestId("offer-row").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/offers\/\d+\?list=/);
  await page.getByRole("link", { name: "Back to offers" }).click();
  await expect(page).toHaveURL(/\/offers\?class=strong&engagement=contract$/);
  await expect(page.getByTestId("filter-class")).toContainText("Strong");
});

test("an offer opened from elsewhere goes back to the default list", async ({ page }) => {
  await page.goto("/offers");
  const href = (await page
    .getByTestId("offer-row")
    .first()
    .getByRole("link")
    .first()
    .getAttribute("href"))!;
  await page.goto(href.replace(/\?.*$/, ""));
  await page.getByRole("link", { name: "Back to offers" }).click();
  await expect(page).toHaveURL(/\/offers$/);
});

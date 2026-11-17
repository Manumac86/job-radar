import { expect, test } from "@playwright/test";

test("filters strong contract offers, sorted by score descending", async ({ page }) => {
  await page.goto("/offers");
  await expect(page.getByTestId("offer-row").first()).toBeVisible();

  await page.getByTestId("filter-class").click();
  await page.getByRole("option", { name: "Strong (80+)" }).click();
  await expect(page).toHaveURL(/class=strong/);
  await page.getByTestId("filter-engagement").click();
  await page.getByRole("option", { name: "Contract" }).click();
  await expect(page).toHaveURL(/engagement=contract/);

  // "Contract AI Engineer" was applied to in offer-detail.spec.ts: hidden until "Show applied".
  const rows = page.getByTestId("offer-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("Fractional CTO");
  await expect(page.getByText("1 offer match these filters (1 applied hidden).")).toBeVisible();

  await page.getByLabel("Show applied").click();
  await expect(page).toHaveURL(/applied=1/);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Contract AI Engineer");
  await expect(rows.nth(0)).toContainText("90");
  await expect(rows.nth(1)).toContainText("Fractional CTO");
  await expect(page.getByText("2 offers match these filters.")).toBeVisible();
});

test("free-text search narrows the list", async ({ page }) => {
  await page.goto("/offers");
  await page.getByLabel("Search offers").fill("Tailspin");
  await expect(page).toHaveURL(/q=Tailspin/);
  await expect(page.getByTestId("offer-row")).toHaveCount(1);
});

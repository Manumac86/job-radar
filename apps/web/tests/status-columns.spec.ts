import { expect, test } from "@playwright/test";

// Runs after pipeline.spec.ts, which moves Contoso's application to "Technical interview".
test("applied offers are hidden by default and show their pipeline stage when shown", async ({
  page,
}) => {
  await page.goto("/offers?q=Contoso");
  await expect(page.getByTestId("offer-row")).toHaveCount(0);
  await expect(page.getByText("0 offers match these filters (1 applied hidden).")).toBeVisible();

  await page.getByLabel("Show applied").click();
  const row = page.getByTestId("offer-row").filter({ hasText: "Staff Frontend Engineer" });
  await expect(row.getByTestId("offer-status")).toHaveText("Applied");
  await expect(row.getByTestId("offer-pipeline")).toHaveText("Technical interview");
});

test("each status is a colored badge and offers without an application have no pipeline", async ({
  page,
}) => {
  await page.goto("/offers?applied=1&sort=title&dir=asc");
  const status = (title: string) =>
    page.getByTestId("offer-row").filter({ hasText: title }).getByTestId("offer-status");
  await expect(status("Tailspin")).toHaveText("New");
  await expect(status("Staff Frontend Engineer")).toHaveText("Applied");
  await expect(
    page.getByTestId("offer-row").filter({ hasText: "Tailspin" }).getByTestId("offer-pipeline"),
  ).toHaveText("");

  // Shortlist one offer to compare three statuses.
  await page.getByRole("link", { name: "PHP Maintainer" }).click();
  await page.getByRole("button", { name: "Shortlist" }).click();
  await expect(page.getByTestId("triage-state")).toHaveText("Shortlisted");
  await page.goto("/offers?applied=1&sort=title&dir=asc");
  await expect(status("PHP Maintainer")).toHaveText("Shortlisted");

  const color = (title: string) => status(title).evaluate((el) => getComputedStyle(el).color);
  const colors = [
    await color("Tailspin"),
    await color("Staff Frontend Engineer"),
    await color("PHP Maintainer"),
  ];
  expect(new Set(colors).size).toBe(3);
});

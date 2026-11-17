import { expect, test } from "@playwright/test";

test("researches a company from an offer and shows sourced facts", async ({ page }) => {
  // Dismissed in learning.spec.ts, so it is only listed with the dismissed filter.
  await page.goto("/offers?triage=dismissed");
  await page.getByRole("link", { name: "Web3 Backend Engineer" }).click();
  const card = page.getByTestId("company-card");
  await expect(card).toContainText("Not researched yet");
  await card.getByRole("button", { name: "Research company" }).click();

  const facts = page.getByTestId("company-facts");
  await expect(facts).toContainText("Tokenly builds AI tooling for logistics teams.", {
    timeout: 15_000,
  });
  await expect(facts).toContainText("Series b · Series B, 30 M EUR, 2026-10");
  // The sample cites a page it never read for the headcount: it is dropped, not shown.
  await expect(facts).not.toContainText("Headcount");
  await expect(card.getByTestId("company-source").first()).toHaveAttribute(
    "href",
    "https://tokenly.example",
  );
  await expect(card).toContainText("Tokenly raises a 30 M EUR Series B");
  await expect(card).toContainText("Researched today");
  await expect(card.getByRole("button", { name: "Refresh" })).toBeVisible();
});

test("manual research at the daily cap shows the limit", async ({ page }) => {
  const setCap = async (value: string) => {
    await page.goto("/settings");
    const form = page.getByRole("form", { name: "General settings" });
    await form.getByLabel("Daily company research cap").fill(value);
    await form.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/^Saved/).first()).toBeVisible();
  };
  await setCap("1");
  try {
    await page.goto("/offers");
    await page.getByRole("link", { name: "PHP Maintainer" }).click();
    await page
      .getByTestId("company-card")
      .getByRole("button", { name: /Research company|Refresh|Retry/ })
      .click();
    await expect(page.getByText(/Daily research limit of 1 reached/)).toBeVisible();
  } finally {
    await setCap("10");
  }
});

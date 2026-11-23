import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prefsFile = join(tmpdir(), "job-radar-ui-test", "profile", "preferences.yaml");
let original = "";
test.beforeAll(() => {
  original = readFileSync(prefsFile, "utf8");
});
test.afterEach(() => writeFileSync(prefsFile, original));

const form = (page: Page) => page.getByRole("form", { name: "Preferences" });

test("hybrid and preferred regions are edited in the Location section", async ({ page }) => {
  await page.goto("/settings");
  const location = form(page).locator("details", {
    has: page.getByText("Location", { exact: true }),
  });
  if ((await location.getAttribute("open")) === null) await location.locator("summary").click();
  for (const name of ["Hybrid regions", "Preferred regions"]) {
    const field = form(page).getByRole("textbox", { name, exact: true });
    await field.fill("Spain");
    await field.press("Enter");
  }
  await form(page).getByLabel("Preferred region bonus").fill("8");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  // A location change offers the rescore.
  await expect(page.getByRole("button", { name: "Rescore open offers" })).toBeVisible();
  const text = readFileSync(prefsFile, "utf8");
  expect(text).toMatch(/hybrid_regions:\s*\[?\s*-?\s*Spain/);
  expect(text).toMatch(/preferred_regions:\s*\[?\s*-?\s*Spain/);
  expect(text).toMatch(/preferred_bonus: 8/);
});

test("the offer shows the preferred-region bonus next to the model score", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("link", { name: "RAG Consultant" }).click();
  await expect(page.getByText(/Model 65 · \+5 preferred region \(Spain\)/)).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickTime } from "./pickers";

const prefsFile = join(tmpdir(), "job-radar-ui-test", "profile", "preferences.yaml");

test("saving settings updates preferences.yaml and keeps its comments", async ({ page }) => {
  await page.goto("/settings");
  const form = page.getByRole("form", { name: "General settings" });
  await form.getByLabel("Minimum hourly rate (EUR)").fill("72");
  await pickTime(page, form, "Daily digest time", "09:15");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/^Saved/)).toBeVisible();

  const yaml = readFileSync(prefsFile, "utf8");
  expect(yaml).toMatch(/min_hourly: \{ USD: 60, EUR: 72, GBP: 50 \}/);
  expect(yaml).toContain('digest_time: "09:15"');
  expect(yaml).toContain("# Job Radar — example preferences");
});

test("invalid settings are rejected and the file is not changed", async ({ page }) => {
  const before = readFileSync(prefsFile, "utf8");
  await page.goto("/settings");
  const form = page.getByRole("form", { name: "General settings" });
  await form.getByLabel("Strong threshold").fill("50");
  await form.getByLabel("Possible threshold").fill("70");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByTestId("validation-errors")).toContainText(
    "possible must be lower than strong",
  );
  expect(readFileSync(prefsFile, "utf8")).toBe(before);
});

test("the YAML editor refuses an invalid file with field errors", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Profile files" }).click();
  const editor = page.getByLabel("preferences.yaml");
  const text = await editor.inputValue();
  await editor.fill(text.replace("weekly_capacity_hours: 40", "weekly_capacity_hours: 400"));
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByTestId("validation-errors")).toContainText(
    "engagement.weekly_capacity_hours",
  );
  expect(readFileSync(prefsFile, "utf8")).toContain("weekly_capacity_hours: 40");
});

import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickTime } from "./pickers";

const prefsFile = join(tmpdir(), "job-radar-ui-test", "profile", "preferences.yaml");
let original = "";

test.beforeAll(() => {
  original = readFileSync(prefsFile, "utf8");
});
// Every test starts from the seeded file, so they do not depend on each other.
test.afterEach(() => writeFileSync(prefsFile, original));

const form = (page: Page) => page.getByRole("form", { name: "Preferences" });
const save = (page: Page) => page.getByRole("button", { name: "Save preferences" }).click();
const view = (page: Page, name: "Form" | "YAML") =>
  page
    .getByRole("radio", { name })
    .or(page.getByRole("button", { name, exact: true }))
    .first();
const openSection = async (page: Page, title: string) => {
  const details = form(page).locator("details", { has: page.getByText(title, { exact: true }) });
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  return details;
};

test("Preferences is the default tab and covers every section", async ({ page }) => {
  await page.goto("/settings");
  await expect(form(page)).toBeVisible();
  for (const title of [
    "Targets",
    "Keywords and companies",
    "Engagement and rates",
    "Location",
    "Service lines",
    "About you",
    "Scoring and research",
    "Notifications",
  ])
    await expect(form(page).getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(/Per-source settings .* are edited in the YAML view/)).toBeVisible();
});

test("adding a target role in the form shows it in the YAML view", async ({ page }) => {
  await page.goto("/settings");
  const roles = form(page).getByRole("textbox", { name: "Target roles", exact: true });
  await roles.fill("Staff AI Engineer");
  await roles.press("Enter");
  await expect(page.getByTestId("unsaved-count")).toHaveText("1 unsaved change");
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  expect(readFileSync(prefsFile, "utf8")).toContain("  - Staff AI Engineer\n");

  await view(page, "YAML").click();
  await expect(page.getByLabel("preferences.yaml")).toHaveValue(/- Staff AI Engineer/);
  await expect(page).toHaveURL(/view=yaml/);
});

test("changing one field keeps every other line and the comments", async ({ page }) => {
  await page.goto("/settings");
  await form(page).getByLabel("Weekly capacity (hours)").fill("32");
  await form(page).getByRole("spinbutton", { name: "Minimum hourly rate (EUR)" }).fill("72");
  await pickTime(page, await openSection(page, "Notifications"), "Daily digest time", "09:15");
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();

  const yaml = readFileSync(prefsFile, "utf8");
  const before = original.split("\n");
  const changed = yaml.split("\n").filter((line, i) => before[i] !== line);
  expect(changed).toEqual([
    "  weekly_capacity_hours: 32",
    original
      .split("\n")
      .find((l) => l.includes("min_hourly:"))
      ?.replace(/EUR: \d+/, "EUR: 72"),
    '  digest_time: "09:15"',
  ]);
  expect(yaml).toContain("# Job Radar — example preferences");
});

test("an invalid value shows its error at the field and nothing is written", async ({ page }) => {
  await page.goto("/settings");
  const scoring = await openSection(page, "Scoring and research");
  await scoring.getByLabel("Strong threshold").fill("50");
  await scoring.getByLabel("Possible threshold").fill("70");
  await save(page);
  await expect(scoring.getByRole("alert")).toContainText("possible must be lower than strong");
  await expect(page.getByTestId("validation-errors")).toBeVisible();
  expect(readFileSync(prefsFile, "utf8")).toBe(original);
});

test("clearing the target rates removes the key", async ({ page }) => {
  await page.goto("/settings");
  for (const cur of ["USD", "EUR", "GBP"])
    await form(page)
      .getByRole("button", { name: `Remove Target hourly rate (${cur})` })
      .click();
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  const yaml = readFileSync(prefsFile, "utf8");
  expect(yaml).not.toContain("target_hourly");
  const minHourly = original.split("\n").find((l) => l.includes("min_hourly:"));
  expect(yaml).toContain(`${minHourly}\n`);
});

test("hidden companies are cleaned and applied from the form", async ({ page }) => {
  await page.goto("/settings");
  const companies = form(page).getByRole("textbox", { name: "Hidden companies", exact: true });
  await companies.fill("  Crossover  ");
  await companies.press("Enter");
  await save(page);
  await expect(page.getByText(/^Saved.*offers hidden/).first()).toBeVisible();
  expect(readFileSync(prefsFile, "utf8")).toMatch(/exclude_companies: \[?\s*-? ?Crossover/);
});

test("a skill added in YAML appears in the form", async ({ page }) => {
  await page.goto("/settings?tab=preferences&view=yaml");
  const editor = page.getByLabel("preferences.yaml");
  await editor.fill(
    (await editor.inputValue()).replace("skills: [TypeScript,", "skills: [Elixir, TypeScript,"),
  );
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  await view(page, "Form").click();
  await expect(form(page).getByRole("group", { name: "Skills items" })).toContainText("Elixir");
});

test("switching views with unsaved form changes asks to save or discard", async ({ page }) => {
  await page.goto("/settings");
  await form(page).getByLabel("Weekly capacity (hours)").fill("20");
  await view(page, "YAML").click();
  const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByLabel("preferences.yaml")).toHaveValue(/weekly_capacity_hours: 40/);
  expect(readFileSync(prefsFile, "utf8")).toBe(original);
});

test("invalid YAML blocks the switch to the form and is never written", async ({ page }) => {
  await page.goto("/settings?tab=preferences&view=yaml");
  const editor = page.getByLabel("preferences.yaml");
  await editor.fill(
    (await editor.inputValue()).replace(
      "  weekly_capacity_hours: 40",
      "weekly_capacity_hours: 40\n   x: [",
    ),
  );
  await view(page, "Form").click();
  await expect(page.getByTestId("validation-errors")).toContainText("preferences.yaml line");
  await expect(page.getByLabel("preferences.yaml")).toBeVisible();

  await editor.fill(original.replace("weekly_capacity_hours: 40", "weekly_capacity_hours: 400"));
  await save(page);
  await expect(page.getByTestId("validation-errors")).toContainText(
    "engagement.weekly_capacity_hours",
  );
  expect(readFileSync(prefsFile, "utf8")).toBe(original);
});

test("a save over a file changed elsewhere is refused", async ({ page }) => {
  await page.goto("/settings");
  writeFileSync(
    prefsFile,
    original.replace("weekly_capacity_hours: 40", "weekly_capacity_hours: 41"),
  );
  await form(page).getByLabel("Weekly capacity (hours)").fill("30");
  await save(page);
  await expect(page.getByText(/changed since you opened it/).first()).toBeVisible();
  expect(readFileSync(prefsFile, "utf8")).toContain("weekly_capacity_hours: 41");
});

test("list fields: Backspace removes, arrows reorder, service lines are added", async ({
  page,
}) => {
  await page.goto("/settings");
  const skills = form(page).getByRole("textbox", { name: "Skills", exact: true });
  await skills.press("Backspace"); // removes the last skill (AWS)
  await form(page).getByRole("button", { name: "Move JavaScript earlier" }).click();
  const lines = await openSection(page, "Service lines");
  await lines.getByRole("button", { name: "Add service line" }).click();
  const added = lines.getByTestId("service-line").last();
  await added.getByLabel("Name", { exact: true }).fill("AI audits");
  await expect(added.getByLabel("Id", { exact: true })).toHaveValue("ai-audits");
  await added.getByLabel("Evidence").fill("Fabrikam model review");
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();

  const yaml = readFileSync(prefsFile, "utf8");
  expect(yaml).toMatch(/skills: \[JavaScript, TypeScript, React,[^\n]*Docker\]\n/);
  expect(yaml).toContain(
    "  - id: ai-audits\n    name: AI audits\n    evidence: Fabrikam model review\n",
  );
  expect(yaml).toContain("# used to label matches and tailor drafts");
});

test("how often email is checked is set in the Notifications section", async ({ page }) => {
  await page.goto("/settings");
  const section = await openSection(page, "Notifications");
  const field = section.getByRole("spinbutton", { name: "Check email every (minutes)" });
  await expect(field).toHaveValue("15");
  await field.fill("30");
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  expect(readFileSync(prefsFile, "utf8")).toContain("  check_minutes: 30 # how often");
});

test("'Open links at' keeps an https address and does not suggest rescoring", async ({ page }) => {
  await page.goto("/settings");
  const section = await openSection(page, "Notifications");
  await section.getByLabel("Open links at").fill("https://my-mac.tailnet-name.ts.net");
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Rescore open offers" })).toHaveCount(0);
  // The key itself, not the commented example line in the seeded file.
  const key = /^\s+link_base_url:\s*(\S+)/m;
  expect(readFileSync(prefsFile, "utf8").match(key)?.[1]).toBe(
    "https://my-mac.tailnet-name.ts.net",
  );
  // Kept after a reload; clearing it removes the key, so links go back to the local address.
  await page.reload();
  const reloaded = await openSection(page, "Notifications");
  await expect(reloaded.getByLabel("Open links at")).toHaveValue(
    "https://my-mac.tailnet-name.ts.net",
  );
  await reloaded.getByLabel("Open links at").fill("");
  await save(page);
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  expect(readFileSync(prefsFile, "utf8")).not.toMatch(key);
});

test("'Open links at' without http:// or https:// shows the error and writes nothing", async ({
  page,
}) => {
  await page.goto("/settings");
  const section = await openSection(page, "Notifications");
  await section.getByLabel("Open links at").fill("my-mac");
  await save(page);
  await expect(section.getByRole("alert")).toContainText(
    "must be an address starting with http:// or https://",
  );
  expect(readFileSync(prefsFile, "utf8")).toBe(original);
});

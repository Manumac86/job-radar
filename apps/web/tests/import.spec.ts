import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("add an offer I applied to elsewhere, from its link and pasted text", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab", { name: "From a link" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
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

const SIMPLEAPPLY_CSV = join(
  import.meta.dirname,
  "../../../packages/sources/test/fixtures/simpleapply-export.csv",
);

test("import a SimpleApply export and see its offers", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "SimpleApply CSV" }).click();
  await dialog.getByLabel("SimpleApply export (.csv)").setInputFiles(SIMPLEAPPLY_CSV);
  await dialog.getByRole("button", { name: "Import file" }).click();
  const status = dialog.getByRole("status");
  await expect(status).toContainText("2 new · 0 already known · 1 filtered · 2 invalid");
  await expect(status).toContainText("1 marked as applied in the pipeline");
  await status.getByRole("link", { name: "See SimpleApply offers" }).click();
  await expect(page).toHaveURL(/source=simpleapply/);
  await expect(page.getByText("Senior Software Engineer, Payments")).toBeVisible();

  // Importing it again adds nothing.
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const again = page.getByRole("dialog");
  await again.getByRole("tab", { name: "SimpleApply CSV" }).click();
  await again.getByLabel("SimpleApply export (.csv)").setInputFiles(SIMPLEAPPLY_CSV);
  await again.getByRole("button", { name: "Import file" }).click();
  await expect(again.getByRole("status")).toContainText("0 new · 3 already known");
});

test("a CSV that is not a SimpleApply export names the missing columns", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "SimpleApply CSV" }).click();
  await dialog.getByLabel("SimpleApply export (.csv)").setInputFiles({
    name: "other.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Title,Company\nA,B\n"),
  });
  await dialog.getByRole("button", { name: "Import file" }).click();
  await expect(dialog.getByRole("alert")).toContainText("missing columns Job Title, Job URL");
});

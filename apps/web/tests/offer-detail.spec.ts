import { expect, test } from "@playwright/test";

test("'Mark as applied' creates an application with the sent draft", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("link", { name: "Contract AI Engineer" }).click();
  await expect(page.getByRole("heading", { name: "Contract AI Engineer" })).toBeVisible();
  await expect(page.getByTestId("draft-message")).toContainText("Hello Northwind");
  for (const action of [
    "Copy draft",
    "Open offer page",
    "Shortlist",
    "Dismiss",
    "Mark as applied",
  ]) {
    await expect(
      page.getByRole("button", { name: action }).or(page.getByRole("link", { name: action })),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Mark as applied" }).click();
  await expect(page.getByRole("dialog")).toContainText("Job Radar never submits anything");
  await page.getByRole("button", { name: "Confirm applied" }).click();

  await expect(page.getByTestId("application-stage")).toHaveText("Applied");
  await expect(page.getByTestId("timeline")).toContainText("Marked as applied (sent draft #1)");
  await expect(page.getByRole("button", { name: "Applied" })).toBeDisabled();
});

test("shortlist, dismiss with reasons, restore", async ({ page }) => {
  await page.goto("/offers");
  await page.getByRole("link", { name: "RAG Consultant" }).click();
  await page.getByRole("button", { name: "Shortlist" }).click();
  await expect(page.getByTestId("triage-state")).toHaveText("Shortlisted");
  await page.getByRole("button", { name: "Dismiss" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Duplicate or already seen" }).click();
  await expect(dialog.getByLabel("Learn from this")).not.toBeChecked();
  await dialog.getByRole("button", { name: "Duplicate or already seen" }).click();
  await dialog.getByRole("button", { name: "Seniority" }).click();
  await expect(dialog.getByLabel("Learn from this")).toBeChecked();
  await dialog.getByLabel("Note (optional)").fill("Budget too low");
  await dialog.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("triage-state")).toHaveText("Dismissed");
  await expect(page.getByTestId("dismiss-reason")).toHaveText(
    "Dismissed: Seniority — Budget too low",
  );
  await expect(page.getByTestId("timeline")).toContainText(
    "Marked dismissed: Seniority — Budget too low",
  );
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("triage-state")).toHaveText("New");
});

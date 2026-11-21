import { expect, test } from "@playwright/test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs early (alphabetical): the variant is removed at the end so later specs see none.
const cvsDir = join(tmpdir(), "job-radar-ui-test", "profile", "cvs");
test.afterAll(() => rmSync(cvsDir, { recursive: true, force: true }));
test.describe.configure({ mode: "serial" });

const openOffer = async (page: import("@playwright/test").Page) => {
  await page.goto("/offers?applied=1&q=Woodgrove");
  await page.getByRole("link", { name: "Head of Platform" }).click();
  await expect(page.getByRole("heading", { name: "Head of Platform" })).toBeVisible();
};

test("without variants there is no CV recommendation or CV choice", async ({ page }) => {
  await openOffer(page);
  await expect(page.getByTestId("cv-recommendation")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "CV to write for" })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark as applied" }).click();
  await expect(page.getByRole("combobox", { name: "CV you sent" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("add, rename and refresh: the shortlisted offer gets a recommendation", async ({ page }) => {
  await page.goto("/settings?tab=profile");
  const card = page.getByTestId("cv-variants");
  await card.getByRole("button", { name: "Add variant" }).click();
  const form = page.getByRole("form", { name: "CV variant" });
  await form.getByLabel("Name").fill("Platform Lead");
  await form.getByLabel("Use for").fill("Head of / Lead platform roles");
  await form.getByLabel("CV text (Markdown)").fill("# Alex Rivera\n\nLed a platform team of 6.");
  await form.getByRole("button", { name: "Save variant" }).click();
  await expect(card.getByText("Platform Lead")).toBeVisible();
  await expect(card.getByText("cvs/platform-lead.md")).toBeVisible();

  await card.getByRole("button", { name: "Edit Platform Lead" }).click();
  await form.getByLabel("Name").fill("Engineering Lead");
  await form.getByRole("button", { name: "Save variant" }).click();
  await expect(card.getByText("Engineering Lead")).toBeVisible();
  await expect(card.getByText("cvs/platform-lead.md")).toBeVisible(); // the id stays

  await card.getByRole("button", { name: /Refresh CV recommendations \(1\)/ }).click();
  await expect(page.getByText(/1 shortlisted offers? queued/).first()).toBeVisible();

  await openOffer(page);
  const rec = page.getByTestId("cv-recommendation");
  await expect(rec).toContainText("Recommended CV: Engineering Lead", { timeout: 15_000 });
  await expect(rec).toContainText("May be missing from this CV:");
  await expect(rec).toContainText("Kubernetes");
});

test("drafts are written for a CV and Mark as applied records the CV sent", async ({ page }) => {
  await openOffer(page);
  await expect(page.getByRole("combobox", { name: "CV to write for" })).toContainText(
    "Engineering Lead (recommended)",
  );
  // The rescore made it a strong match, so a draft may already exist: write a new version.
  await page.getByRole("button", { name: /^(Generate draft|Regenerate)$/ }).click();
  await expect(page.getByTestId("draft-cv")).toHaveText("Written for CV: Engineering Lead", {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Mark as applied" }).click();
  await expect(page.getByRole("combobox", { name: "CV you sent" })).toContainText(
    "Engineering Lead",
  );
  await page.getByRole("button", { name: "Confirm applied" }).click();
  await expect(page.getByTestId("application-stage")).toHaveText("Applied");

  await page.goto("/");
  await page.getByRole("tab", { name: "CV sent" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Engineering Lead");
});

test("the CV sent can be changed from the pipeline, and a variant can be deleted", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await page.getByText("Head of Platform").first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox", { name: "CV sent" }).click();
  await page.getByRole("option", { name: "Master CV" }).click();
  await expect(page.getByText("CV sent: Master CV").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await openOffer(page);
  await expect(page.getByTestId("timeline")).toContainText("CV sent changed to Master CV");

  await page.goto("/settings?tab=profile");
  const card = page.getByTestId("cv-variants");
  await card.getByRole("button", { name: "Delete Engineering Lead" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete variant" }).click();
  await expect(card.getByText("No variants yet.")).toBeVisible();
});

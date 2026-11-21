import { expect, test } from "@playwright/test";

// Email replies (application-emails). The test-mode worker connects to a fake, read-only mailbox:
// every INBOX holds 3 messages, and a host containing "invalid" refuses the login.
test.describe.configure({ mode: "serial" });

test("add, test, edit and remove an email account; the password is never shown", async ({
  page,
}) => {
  await page.goto("/settings?tab=email");
  const card = page.getByTestId("mail-accounts");
  await expect(card.getByText("No accounts yet.")).toBeVisible();
  await card.getByRole("button", { name: "Add account" }).click();
  const form = page.getByRole("form", { name: "Email account" });
  await form.getByLabel("Name").fill("Personal");
  await form.getByLabel("Email address").fill("owner@example.invalid");
  await form.getByLabel("App password").fill("test-app-password");
  await form.getByRole("button", { name: "Save account" }).click();
  await expect(card.getByText("Personal")).toBeVisible();
  await expect(card.getByText("owner@example.invalid · imap.gmail.com · INBOX")).toBeVisible();
  await expect(page.getByText("test-app-password")).toHaveCount(0);

  await card.getByRole("button", { name: "Test" }).click();
  await expect(page.getByText("Connected (read-only): 3 messages in INBOX")).toBeVisible();

  await card.getByRole("button", { name: "Edit Personal" }).click();
  await expect(form.getByLabel("App password")).toHaveValue("");
  await expect(form.getByLabel("App password")).toHaveAttribute(
    "placeholder",
    "Saved. Type a new one to replace it",
  );
  await form.getByLabel("Folders").fill("INBOX, Jobs");
  await form.getByRole("button", { name: "Save account" }).click();
  await expect(
    card.getByText("owner@example.invalid · imap.gmail.com · INBOX, Jobs"),
  ).toBeVisible();

  await card.getByRole("button", { name: "Remove Personal" }).click();
  await page.getByRole("button", { name: "Remove account" }).click();
  await expect(card.getByText("No accounts yet.")).toBeVisible();
});

test("a custom server that refuses the login shows how to fix it", async ({ page }) => {
  await page.goto("/settings?tab=email");
  const card = page.getByTestId("mail-accounts");
  await card.getByRole("button", { name: "Add account" }).click();
  const form = page.getByRole("form", { name: "Email account" });
  await form.getByRole("combobox", { name: "Provider" }).click();
  await page.getByRole("option", { name: "Other (IMAP)" }).click();
  await form.getByLabel("Name").fill("Work");
  await form.getByLabel("Email address").fill("me@example.invalid");
  await form.getByLabel("IMAP server").fill("imap.invalid.example");
  await form.getByLabel("App password").fill("wrong");
  await form.getByRole("button", { name: "Save account" }).click();
  await card.getByRole("button", { name: "Test" }).click();
  await expect(card.getByRole("alert")).toContainText("imap.invalid.example rejected the login");
  await card.getByRole("button", { name: "Remove Work" }).click();
  await page.getByRole("button", { name: "Remove account" }).click();
  await expect(card.getByText("No accounts yet.")).toBeVisible();
});

test("an automatic update shows in the sheet and the timeline, and Undo reverts it", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const screening = page.getByTestId("column-screening_call");
  await screening.getByRole("button", { name: "Adatum Platform Engineer", exact: true }).click();
  const sheet = page.getByRole("dialog");
  const entry = sheet.getByTestId("email-entry");
  await expect(entry).toContainText("Dana at Adatum");
  await expect(entry).toContainText("Updated automatically");
  await expect(entry.getByRole("link", { name: "Open in Mail" })).toHaveAttribute(
    "href",
    "message://%3Cinvite-1%40adatum.example%3E",
  );
  await entry.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Undone" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByTestId("column-applied").getByRole("button", { name: /^Adatum/ }),
  ).toHaveCount(2);

  await page.goto("/offers?applied=1&q=Adatum");
  await page.getByRole("link", { name: "Platform Engineer", exact: true }).click();
  const timeline = page.getByTestId("timeline");
  await expect(timeline.getByTestId("email-entry")).toContainText("Undone");
  await expect(timeline).toContainText("Undid the update from the email");
});

test("a suggestion asks which application, then applies to the one picked", async ({ page }) => {
  await page.goto("/pipeline");
  const strip = page.getByTestId("email-suggestions");
  const entry = strip.getByTestId("email-entry");
  await expect(entry).toContainText("Sends a take-home assignment due in a week.");
  await expect(entry).toContainText("Not applied: medium confidence");
  await expect(entry.getByRole("button", { name: "Apply" })).toBeDisabled();
  await entry.getByRole("combobox", { name: "Application for this email" }).click();
  await page.getByRole("option", { name: "Data Platform Engineer at Adatum" }).click();
  await entry.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Applied" })).toBeVisible();
  await expect(strip).toHaveCount(0);
  await expect(
    page.getByTestId("column-take_home").getByRole("button", { name: /^Adatum/ }),
  ).toBeVisible();
});

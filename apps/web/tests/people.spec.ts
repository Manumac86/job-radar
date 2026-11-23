import { expect, test, type Page } from "@playwright/test";

// offer-notes-and-people: notes and people on offers (seeded Proseware offers, no other spec uses them).

/** "Add person" is a search: typing a new name offers "Create <name>" (people-directory D3). */
async function createFromSearch(page: Page, name: string) {
  await page.getByTestId("people").getByRole("button", { name: "Add person" }).click();
  await page.getByRole("combobox", { name: "Search people" }).fill(name);
  await page.getByRole("option", { name: `Create ${name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name")).toHaveValue(name);
  return dialog;
}

async function openOffer(page: Page, title: string) {
  await page.goto("/offers?applied=1&q=Proseware");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test("a note on an offer without an application shows in its timeline and changes nothing else", async ({
  page,
}) => {
  await openOffer(page, "Data Platform Engineer");
  await page.getByLabel("Note", { exact: true }).fill("Contacted on Telegram");
  await page.getByRole("button", { name: "Add note" }).click();
  const timeline = page.getByTestId("timeline");
  await expect(timeline.getByTestId("timeline-note").first()).toContainText(
    "Contacted on Telegram",
  );
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("");
  // Still a new offer: no application was created.
  await expect(page.getByRole("button", { name: "Mark as applied" })).toBeVisible();
});

test("people: add, see in the timeline, reuse on another offer, remove", async ({ page }) => {
  await openOffer(page, "Data Platform Engineer");
  const people = page.getByTestId("people");
  const dialog = await createFromSearch(page, "Jane Roe");
  await expect(dialog.getByLabel("Company")).toHaveValue("Proseware");
  await dialog.getByLabel("Role").fill("Recruiter");
  await dialog.getByLabel("LinkedIn").fill("https://www.linkedin.com/in/jane-roe-example");
  await dialog.getByLabel("Email").fill("jane@proseware.example");
  await dialog.getByLabel("Other contact").fill("@janeroe on Telegram");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const jane = people.getByTestId("person").filter({ hasText: "Jane Roe" });
  await expect(jane).toContainText("Recruiter");
  await expect(jane.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/jane-roe-example",
  );
  await expect(jane.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("target", "_blank");
  await expect(jane.getByRole("button", { name: "Copy email" })).toBeVisible();
  await expect(page.getByTestId("timeline")).toContainText("Added Jane Roe (Recruiter)");
  await expect(page.getByTestId("timeline")).not.toContainText("jane@proseware.example");

  // Known at the company on its other offer.
  await openOffer(page, "ML Platform Engineer");
  const known = page.getByTestId("people-known");
  await expect(known).toContainText("Known at Proseware");
  await known.getByRole("button", { name: "Add to this offer" }).click();
  await expect(
    page.getByTestId("people").getByTestId("person").filter({ hasText: "Jane Roe" }),
  ).toBeVisible();
  await expect(page.getByTestId("people-known")).toHaveCount(0);

  await page.getByRole("button", { name: "Remove Jane Roe from this offer" }).click();
  await expect(page.getByTestId("people").getByTestId("person")).toHaveCount(0);
  await expect(page.getByTestId("timeline")).toContainText("Removed Jane Roe");
  await expect(page.getByTestId("people-known")).toContainText("Jane Roe");
});

test("an invalid LinkedIn link is refused at the field", async ({ page }) => {
  await openOffer(page, "ML Platform Engineer");
  const dialog = await createFromSearch(page, "John Doe");
  await dialog.getByLabel("LinkedIn").fill("https://example.com/john");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Use an https link on linkedin.com")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("people").getByTestId("person")).toHaveCount(0);
});

test("a note from the pipeline drawer does not move the card", async ({ page }) => {
  await page.goto("/pipeline");
  const applied = page.getByTestId("column-applied");
  await applied.getByRole("button", { name: "Proseware Solutions Architect", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet
    .getByLabel("Note", { exact: true })
    .fill("Referral possible through a former colleague");
  await sheet.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Note added" })).toBeVisible();
  await expect(sheet.getByTestId("people")).toContainText("No people yet.");
  await page.keyboard.press("Escape");
  await expect(
    applied.getByRole("button", { name: "Proseware Solutions Architect", exact: true }),
  ).toBeVisible();

  await page.goto("/offers?applied=1&q=Proseware");
  await page.getByRole("link", { name: "Solutions Architect", exact: true }).click();
  await expect(page.getByTestId("timeline-note").first()).toContainText(
    "Referral possible through a former colleague",
  );
});

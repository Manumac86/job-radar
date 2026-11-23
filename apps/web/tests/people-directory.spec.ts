import { expect, test, type Page } from "@playwright/test";

// people-directory: search and link anyone, duplicate warning, People page (seeded Wingtip
// offers and people; no other spec uses them).

async function openOffer(page: Page, title: string) {
  await page.goto("/offers?applied=1&q=Wingtip");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function search(page: Page, text: string) {
  await page.getByTestId("people").getByRole("button", { name: "Add person" }).click();
  await page.getByRole("combobox", { name: "Search people" }).fill(text);
}

test("links an agency recruiter from another company by searching", async ({ page }) => {
  await openOffer(page, "QA Engineer");
  await search(page, "northwind");
  await page.getByRole("option", { name: /Rita Agent/ }).click();
  const rita = page.getByTestId("people").getByTestId("person").filter({ hasText: "Rita Agent" });
  await expect(rita).toContainText("Recruiter at Northwind Talent");
  await expect(page.getByTestId("timeline")).toContainText("Added Rita Agent (Recruiter)");
});

test("a duplicate LinkedIn profile offers the existing person", async ({ page }) => {
  await openOffer(page, "QA Engineer");
  await search(page, "Patricia");
  await page.getByRole("option", { name: "Create Patricia" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("LinkedIn").fill("https://es.linkedin.com/in/Pat-Kim-Example/");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Pat Kim (Wingtip) already has this contact",
  );
  await dialog.getByRole("button", { name: "Use Pat Kim" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByTestId("people").getByTestId("person").filter({ hasText: "Pat Kim" }),
  ).toBeVisible();
  await expect(page.getByTestId("people").getByText("Patricia")).toHaveCount(0);
});

test("People page: search, offers, edit, merge and delete", async ({ page }) => {
  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await page.getByLabel("Search people").fill("wingtip");
  await expect(page).toHaveURL(/q=wingtip/);
  const row = (name: string) =>
    page.getByTestId("people-row").filter({ has: page.getByText(name, { exact: true }) });
  await expect(row("Lou Gray").getByTestId("person-offers")).toContainText("Frontend Engineer");

  // Edit a role.
  await row("Lou Gray").getByRole("button", { name: "Edit Lou Gray" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Role").fill("Staff engineer");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(row("Lou Gray")).toContainText("Staff engineer at Wingtip");

  // Merge "P. Kim" into "Pat Kim".
  await row("Pat Kim").getByRole("button", { name: "Merge Pat Kim" }).click();
  const merge = page.getByRole("dialog");
  await merge.getByRole("button", { name: "Choose the duplicate" }).click();
  await page.getByRole("combobox", { name: "Search people" }).fill("P. Kim");
  await page.getByRole("option", { name: /^P\. Kim/ }).click();
  await merge.getByRole("radio", { name: /^Pat Kim/ }).check();
  await merge.getByRole("button", { name: "Merge" }).click();
  await expect(row("P. Kim")).toHaveCount(0);
  const pat = row("Pat Kim");
  await expect(pat.getByTestId("person-offers")).toContainText("Frontend Engineer");
  await expect(pat.getByTestId("person-offers")).toContainText("QA Engineer");
  await expect(pat.getByRole("button", { name: "Copy email" })).toBeVisible();

  // Delete Lou Gray: gone, and the offer's timeline keeps the entry.
  await row("Lou Gray").getByRole("button", { name: "Delete Lou Gray" }).click();
  await page.getByRole("button", { name: "Delete person" }).click();
  await expect(row("Lou Gray")).toHaveCount(0);
  await openOffer(page, "Frontend Engineer");
  await expect(page.getByTestId("people").getByText("Lou Gray")).toHaveCount(0);
  await expect(page.getByTestId("timeline")).toContainText("Added Lou Gray (Engineer)");
});

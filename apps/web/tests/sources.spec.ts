import { expect, test } from "@playwright/test";

test("'Run now' runs a source, records it in the run log and scores new offers", async ({
  page,
}) => {
  await page.goto("/sources");
  const card = page.getByTestId("source-fake");
  await expect(card).toContainText("Never run.");
  await card.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Run started")).toBeVisible();
  await expect(card).toContainText("found 2, new 2, filtered 0", { timeout: 15_000 });
  await card.getByText(/Run log/).click();
  await expect(card.getByTestId("run-log")).toContainText("manual · ok");
  await expect(card.getByTestId("run-log")).toContainText("fake source: 2 offers");

  // New offers were scored by the (test-mode) LLM and are strong matches.
  await page.goto("/offers?q=(test)");
  await expect(page.getByTestId("offer-row")).toHaveCount(2);
  await expect(page.getByTestId("offer-row").first()).toContainText("84");

  // Running again finds them as already known.
  await page.goto("/sources");
  await page.getByTestId("source-fake").getByRole("button", { name: "Run now" }).click();
  await expect(page.getByTestId("source-fake")).toContainText("found 2, new 0", {
    timeout: 15_000,
  });
});

test("logged-in sources require the risk notice before enabling", async ({ page }) => {
  await page.goto("/sources");
  const upwork = page.getByTestId("source-upwork");
  await expect(upwork).toContainText("Logged-in · read-only");
  await upwork.getByRole("checkbox", { name: "Enable Upwork (logged-in)" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Upwork's terms restrict automated access");
  await expect(dialog).toContainText("job-alert email source");
  await dialog.getByRole("button", { name: "Keep disabled" }).click();
  await expect(upwork.getByRole("checkbox")).not.toBeChecked();
});

test("SimpleApply asks for the risk notice and recommends the CSV import", async ({ page }) => {
  await page.goto("/sources");
  const card = page.getByTestId("source-simpleapply");
  await expect(card).toContainText("Logged-in · read-only");
  await card.getByRole("checkbox", { name: "Enable SimpleApply (logged-in)" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "never applies, marks applied, hides a job or touches Full Auto Apply",
  );
  await expect(dialog).toContainText("Offers → Import → SimpleApply CSV");
  await dialog.getByRole("button", { name: "Keep disabled" }).click();
  await expect(card.getByRole("checkbox")).not.toBeChecked();
});

test("notifications: strong-match alerts appear in the app and can be marked read", async ({
  page,
}) => {
  await page.goto("/notifications");
  await expect(page.getByText("Telegram is not connected")).toBeVisible();
  const list = page.getByTestId("notifications");
  await expect(list).toContainText("Strong match 84");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("0 unread.")).toBeVisible();
});

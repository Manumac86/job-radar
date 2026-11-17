import { expect, test } from "@playwright/test";

// The UI tests start from the bundled example profile (tests/seed.ts copies profile-seed/).
test("the example profile notice links to the profile editor", async ({ page }) => {
  await page.goto("/");
  const notice = page.getByTestId("example-profile");
  await expect(notice).toContainText("This is the example profile");
  await notice.getByRole("link", { name: "Edit your profile" }).click();
  await expect(page).toHaveURL(/\/settings\?tab=profile$/);
  await expect(page.getByRole("tab", { name: "Profile files" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByTestId("example-profile")).toBeVisible();
});

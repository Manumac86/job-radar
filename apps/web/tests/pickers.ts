import type { Locator, Page } from "@playwright/test";

/** Picks a date in the shadcn DatePicker (Popover + Calendar with month/year dropdowns). */
export async function pickDate(page: Page, scope: Locator, label: string, iso: string) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  await scope.getByRole("button", { name: label, exact: true }).click();
  const popover = page.locator("[data-slot=popover-content]");
  await popover.getByRole("combobox", { name: /year/i }).selectOption(String(y));
  await popover.getByRole("combobox", { name: /month/i }).selectOption(String(m - 1));
  const day = new Date(y, m - 1, d);
  const name = day.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  await popover
    .getByRole("button", { name: new RegExp(`${name.split(" ")[0]} ${d}(st|nd|rd|th)?, ${y}`) })
    .click();
}

/** Picks "HH:MM" in the shadcn TimePicker (hour and minute selects). */
export async function pickTime(page: Page, scope: Locator, label: string, hhmm: string) {
  const [h, m] = hhmm.split(":") as [string, string];
  await scope.getByRole("combobox", { name: `${label} hour` }).click();
  await page.getByRole("option", { name: h, exact: true }).click();
  await scope.getByRole("combobox", { name: `${label} minute` }).click();
  await page.getByRole("option", { name: m, exact: true }).click();
}

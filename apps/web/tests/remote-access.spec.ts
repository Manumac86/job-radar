import { expect, test } from "@playwright/test";

// Remote access (remote-access spec). A fictional tailnet name is mapped to 127.0.0.1, so pages
// load the way the phone loads them: through a host that is not the Mac's own address.
const REMOTE = "my-mac.tailnet-name.ts.net";
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP ${REMOTE} 127.0.0.1`] } });

function remote(baseURL: string | undefined, path: string): string {
  const url = new URL(path, baseURL);
  url.hostname = REMOTE;
  return url.toString();
}

test("a request that came through Funnel gets 403 with no page content, on every path", async ({
  request,
}) => {
  const funnel = { "Tailscale-Funnel-Request": "?1" };
  const refused = await request.get("/offers", { headers: funnel });
  expect(refused.status()).toBe(403);
  expect(await refused.text()).toBe("");
  expect((await request.get("/no-such-page", { headers: funnel })).status()).toBe(403);

  const served = await request.get("/offers");
  expect(served.status()).toBe(200);
  expect(await served.text()).toContain("Fractional CTO");
});

test("Settings opened from another device says logins open on the Mac", async ({
  page,
  baseURL,
}) => {
  await page.goto(remote(baseURL, "/settings"));
  await page.getByRole("tab", { name: "Sessions" }).click();
  const panel = page.getByTestId("sessions-panel");
  await expect(panel.getByText("SimpleApply (logged-in)")).toBeVisible();
  await expect(panel.getByTestId("remote-login-note")).toContainText(
    "the login window opens on the Mac",
  );
  await expect(panel.locator('a[href*="127.0.0.1"]')).toHaveCount(0);
});

test("at the Mac, the sessions panel shows no remote note", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Sessions" }).click();
  const panel = page.getByTestId("sessions-panel");
  await expect(panel.getByText("SimpleApply (logged-in)")).toBeVisible();
  await expect(panel.getByTestId("remote-login-note")).toHaveCount(0);
});

test("Copy draft on a page that is not secure says why instead of failing silently", async ({
  page,
  baseURL,
}) => {
  // Plain http through a name: the browser offers no clipboard there.
  await page.goto(remote(baseURL, "/offers?applied=1"));
  const hrefs = await page
    .getByTestId("offer-row")
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThan(0);
  await page.goto(remote(baseURL, hrefs[0]!));
  // The button is disabled until the offer has a draft: make one if needed (fake LLM in test
  // mode), so the test does not depend on what other specs left behind.
  const copy = page.getByRole("button", { name: "Copy draft" });
  if (!(await copy.isEnabled())) {
    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect(copy).toBeEnabled();
  }
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Copy draft" }).click();
  await expect(page.getByText("Copying needs a secure address")).toBeVisible();
  expect(errors).toEqual([]);
});

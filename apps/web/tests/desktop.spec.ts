import { expect, test } from "@playwright/test";

test("the Desktop card is hidden in a normal browser", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("form", { name: "General settings" })).toBeVisible();
  await expect(page.getByTestId("desktop-card")).toHaveCount(0);
});

test("inside the macOS app the Desktop card drives the bridge", async ({ page }) => {
  // A fake of the preload bridge (apps/desktop/src/preload.ts).
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    let info: {
      version: string;
      dataDir: string;
      logsDir: string;
      launchAtLogin: boolean;
      claude: { path: string | null; configured: string | null; source: string | null };
      browserInstalled: boolean;
      browser: "Google Chrome" | "Chromium";
      chromiumDownloaded: boolean;
    } = {
      version: "0.1.0",
      dataDir: "/Users/me/Library/Application Support/Job Radar/data",
      logsDir: "/Users/me/Library/Application Support/Job Radar/data/logs",
      launchAtLogin: false,
      claude: { path: "/Users/me/.local/bin/claude", configured: null, source: "known" },
      browserInstalled: false,
      browser: "Chromium",
      chromiumDownloaded: false,
    };
    (window as unknown as { __calls: unknown[] }).__calls = calls;
    (window as unknown as { jobRadarDesktop: unknown }).jobRadarDesktop = {
      getInfo: async () => info,
      setLaunchAtLogin: async (on: boolean) => {
        calls.push(["launch", on]);
        info = { ...info, launchAtLogin: on };
        return on;
      },
      setClaudePath: async (p: string | null) => {
        calls.push(["claude", p]);
        if (p && !p.startsWith("/")) return { ok: false, error: `${p} is not an executable file` };
        info = { ...info, claude: { path: p, configured: p, source: "config" } };
        return { ok: true, path: p };
      },
      installBrowser: async () => {
        calls.push(["browser"]);
        info = { ...info, browserInstalled: true, chromiumDownloaded: true };
        return { ok: true };
      },
      removeChromium: async () => {
        calls.push(["remove-chromium"]);
        info = { ...info, chromiumDownloaded: false };
        return { ok: true };
      },
      onBrowserProgress: () => () => {},
      restart: async () => {},
      openLogs: async () => {
        calls.push(["logs"]);
      },
    };
  });
  await page.goto("/settings");
  const card = page.getByTestId("desktop-card");
  await expect(card).toContainText("Job Radar 0.1.0 for macOS");
  await expect(page.getByTestId("claude-path-status")).toContainText(
    "Using /Users/me/.local/bin/claude (found automatically)",
  );

  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toBeChecked();

  await card.getByLabel("Claude Code CLI").fill("claude");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("claude is not an executable file")).toBeVisible();
  await card.getByLabel("Claude Code CLI").fill("/opt/homebrew/bin/claude");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("claude-path-status")).toContainText(
    "Using /opt/homebrew/bin/claude (set here)",
  );

  await card.getByRole("button", { name: "Download Chromium" }).click();
  await expect(page.getByTestId("desktop-browser")).toContainText(
    "Chromium, with an isolated profile",
  );

  const calls = await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls);
  expect(calls).toEqual([
    ["launch", true],
    ["claude", "claude"],
    ["claude", "/opt/homebrew/bin/claude"],
    ["browser"],
  ]);
});

test("with Google Chrome installed the app uses it and offers to remove the downloaded Chromium", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    let downloaded = true;
    (window as unknown as { __calls: unknown[] }).__calls = calls;
    (window as unknown as { jobRadarDesktop: unknown }).jobRadarDesktop = {
      getInfo: async () => ({
        version: "0.1.0",
        dataDir: "/D",
        logsDir: "/D/logs",
        launchAtLogin: false,
        claude: { path: "/c", configured: null, source: "known" },
        browserInstalled: true,
        browser: "Google Chrome",
        chromiumDownloaded: downloaded,
      }),
      setLaunchAtLogin: async (on: boolean) => on,
      setClaudePath: async () => ({ ok: true }),
      installBrowser: async () => ({ ok: true }),
      removeChromium: async () => {
        calls.push("remove");
        downloaded = false;
        return { ok: true };
      },
      onBrowserProgress: () => () => {},
      restart: async () => {},
      openLogs: async () => {},
    };
  });
  await page.goto("/settings");
  await expect(page.getByTestId("desktop-browser")).toContainText("Google sign-in works");
  const card = page.getByTestId("desktop-card");
  await expect(card.getByRole("button", { name: "Download Chromium" })).toHaveCount(0);
  await card.getByRole("button", { name: "Remove downloaded Chromium" }).click();
  await expect(card.getByRole("button", { name: "Remove downloaded Chromium" })).toHaveCount(0);
});

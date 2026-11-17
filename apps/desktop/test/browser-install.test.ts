import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installChromium, isChromiumInstalled } from "../src/browser-install";

describe("Chromium install on request", () => {
  it("detects an installed Chromium", () => {
    const dir = mkdtempSync(join(tmpdir(), "jr-br-"));
    expect(isChromiumInstalled(join(dir, "none"))).toBe(false);
    expect(isChromiumInstalled(dir)).toBe(false);
    mkdirSync(join(dir, "chromium-1200"));
    expect(isChromiumInstalled(dir)).toBe(true);
  });

  it("runs the installer with the app's browsers folder and reports progress and errors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jr-br-"));
    const ok = join(dir, "ok.mjs");
    writeFileSync(
      ok,
      'console.log("Downloading Chromium 10%"); console.log(process.env.PLAYWRIGHT_BROWSERS_PATH + " " + process.argv.slice(2).join(" "));',
    );
    const lines: string[] = [];
    const res = await installChromium({
      execPath: process.execPath,
      playwrightCli: ok,
      browsersDir: "/B",
      onProgress: (l) => lines.push(l),
    });
    expect(res).toEqual({ ok: true });
    expect(lines).toEqual(["Downloading Chromium 10%", "/B install chromium"]);

    const bad = join(dir, "bad.mjs");
    writeFileSync(bad, 'console.error("network unreachable"); process.exit(1);');
    expect(
      await installChromium({ execPath: process.execPath, playwrightCli: bad, browsersDir: "/B" }),
    ).toEqual({ ok: false, error: "network unreachable" });
  });
});

describe("Google Chrome instead of a downloaded Chromium", () => {
  it("finds Chrome in ~/Applications and removes only Playwright's downloads", async () => {
    const { findChrome, removeDownloadedBrowsers } = await import("../src/browser-install");
    const home = mkdtempSync(join(tmpdir(), "jr-home-"));
    const exe = join(home, "Applications", "Google Chrome.app", "Contents", "MacOS");
    mkdirSync(exe, { recursive: true });
    writeFileSync(join(exe, "Google Chrome"), "");
    expect(findChrome(home)).toMatch(/Google Chrome$/);

    const dir = mkdtempSync(join(tmpdir(), "jr-br-"));
    for (const d of ["chromium-1255", "chromium_headless_shell-1255", "ffmpeg-1013", "keep-me"])
      mkdirSync(join(dir, d));
    removeDownloadedBrowsers(dir);
    expect(isChromiumInstalled(dir)).toBe(false);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(dir)).toEqual(["keep-me"]);
  });
});

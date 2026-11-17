import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, appPaths, ensureDirs, loadConfig, saveConfig } from "../src/paths";

const home = () => mkdtempSync(join(tmpdir(), "jr-home-"));

describe("app paths and desktop.json", () => {
  it("lives in Application Support with the owner's current ports by default", () => {
    const p = appPaths("/Users/me");
    expect(p.root).toBe("/Users/me/Library/Application Support/Job Radar");
    expect(p.data).toBe("/Users/me/Library/Application Support/Job Radar/data");
    expect(loadConfig(p)).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toMatchObject({ webPort: 3300, workerPort: 4000 });
  });

  it("saves, reloads and ignores invalid values", () => {
    const p = appPaths(home());
    saveConfig(p, { claudePath: "/opt/homebrew/bin/claude", launchAtLogin: true });
    expect(loadConfig(p)).toMatchObject({
      claudePath: "/opt/homebrew/bin/claude",
      launchAtLogin: true,
    });
    writeFileSync(p.config, JSON.stringify({ webPort: 80, workerPort: "x", claudePath: " " }));
    expect(loadConfig(p)).toMatchObject({ webPort: 3300, workerPort: 4000, claudePath: null });
    writeFileSync(p.config, "{broken");
    expect(loadConfig(p)).toEqual(DEFAULT_CONFIG);
  });

  it("creates the folders with a private secrets folder", () => {
    const p = appPaths(home());
    const { data } = ensureDirs(p, DEFAULT_CONFIG);
    expect(data).toBe(p.data);
    expect(statSync(p.secrets).mode & 0o777).toBe(0o700);
    expect(statSync(join(p.data, "logs")).isDirectory()).toBe(true);
    expect(statSync(p.browsers).isDirectory()).toBe(true);
  });
});

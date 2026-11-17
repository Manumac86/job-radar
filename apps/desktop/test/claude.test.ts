import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { childPath, findClaude, isExecutable, loginShell } from "../src/claude";

function fakeExe(path: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "#!/bin/sh\necho claude\n");
  chmodSync(path, 0o755);
}

describe("Claude CLI discovery", () => {
  it("prefers the configured path, then known locations, then the login shell", async () => {
    const home = mkdtempSync(join(tmpdir(), "jr-claude-"));
    const configured = join(home, "custom", "claude");
    const local = join(home, ".local", "bin", "claude");
    const viaShell = join(home, "nvm", "bin", "claude");
    fakeExe(configured);
    fakeExe(viaShell);
    const shell = async () => `some login banner\n${viaShell}`;
    const onlyHome = (p: string) => p.startsWith(home) && isExecutable(p);

    expect(await findClaude(configured, { home, shell, exists: onlyHome })).toMatchObject({
      path: configured,
      source: "config",
    });
    expect(await findClaude(null, { home, shell, exists: onlyHome })).toMatchObject({
      path: viaShell,
      source: "shell",
    });
    fakeExe(local);
    expect(await findClaude("/nope/claude", { home, shell, exists: onlyHome })).toEqual({
      path: local,
      source: "known",
      configInvalid: true,
    });
  });

  it("reports a missing CLI", async () => {
    const home = mkdtempSync(join(tmpdir(), "jr-claude-"));
    expect(await findClaude(null, { home, shell: async () => null, exists: () => false })).toEqual({
      path: null,
      source: null,
      configInvalid: false,
    });
  });

  it("builds the children's PATH from the login shell and the CLI folder", async () => {
    expect(await childPath(async () => "/a/bin:/usr/bin", "/Users/me/.local/bin/claude")).toBe(
      "/Users/me/.local/bin:/a/bin:/usr/bin",
    );
    expect(await childPath(async () => null)).toContain("/opt/homebrew/bin");
  });

  it("runs commands in a real login shell", async () => {
    expect(await loginShell("echo hi", "/bin/sh")).toBe("hi");
    expect(await loginShell("exit 1", "/bin/sh")).toBeNull();
  });
});

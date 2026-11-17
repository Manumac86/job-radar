import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("worker config", () => {
  it("defaults to localhost and the repo seed", () => {
    const c = loadConfig({});
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(4000);
    expect(c.seedDir).toMatch(/profile-seed$/);
    expect(c.claudeExecutable).toBeUndefined();
  });

  it("takes the app's seed dir, Claude executable and ports from the environment", () => {
    const c = loadConfig({
      JOB_RADAR_SEED_DIR: "/Applications/Job Radar.app/Contents/Resources/profile-seed",
      CLAUDE_CODE_EXECUTABLE: " /Users/me/.local/bin/claude ",
      WORKER_PORT: "4000",
      WEB_BASE_URL: "http://127.0.0.1:3300",
    });
    expect(c.seedDir).toBe("/Applications/Job Radar.app/Contents/Resources/profile-seed");
    expect(c.claudeExecutable).toBe("/Users/me/.local/bin/claude");
    expect(c.webBaseUrl).toBe("http://127.0.0.1:3300");
    expect(loadConfig({ CLAUDE_CODE_EXECUTABLE: "  " }).claudeExecutable).toBeUndefined();
  });
});

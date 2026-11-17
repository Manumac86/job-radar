import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { tempProfileDir, testApp, testContext } from "./helpers";

describe("profile API", () => {
  it("reports a loaded profile", async () => {
    const { app } = testApp();
    const res = await request(app).get("/profile/status").expect(200);
    expect(res.body).toMatchObject({ status: "ok", errors: [] });
    expect(new Date(res.body.loadedAt).getTime()).toBeGreaterThan(0);
    await request(app).get("/health").expect(200, { ok: true, app: "job-radar", profile: "ok" });
  });

  it("reports field errors when preferences become invalid, and recovers on fix", async () => {
    const dir = tempProfileDir();
    const { app } = testApp(testContext(dir));
    const file = join(dir, "preferences.yaml");
    const good = readFileSync(file, "utf8");
    writeFileSync(file, good.replace("weekly_capacity_hours: 40", "weekly_capacity_hours: -1"));

    const bad = await request(app).post("/profile/reload").expect(422);
    expect(bad.body.status).toBe("invalid");
    expect(bad.body.errors[0]).toMatch(/^engagement\.weekly_capacity_hours: /);
    const status = await request(app).get("/profile/status").expect(200);
    expect(status.body.status).toBe("invalid");
    expect(status.body.lastSuccessfulLoadAt).not.toBeNull();

    writeFileSync(file, good);
    await request(app).post("/profile/reload").expect(200);
  });

  it("reports missing files", async () => {
    const { app } = testApp(testContext(tempProfileDir(false)));
    const res = await request(app).get("/profile/status").expect(200);
    expect(res.body.status).toBe("missing");
    expect(res.body.errors).toHaveLength(2);
  });
});

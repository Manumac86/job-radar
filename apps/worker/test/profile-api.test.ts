import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

describe("CV variants in the profile", () => {
  it("loads a new variant on reload and changes the variants hash", async () => {
    const dir = tempProfileDir();
    const ctx = testContext(dir);
    const { app } = testApp(ctx);
    const before = await request(app).get("/profile/status").expect(200);
    expect(before.body).toMatchObject({ variantsHash: "", variants: [], variantErrors: [] });

    mkdirSync(join(dir, "cvs"), { recursive: true });
    writeFileSync(
      join(dir, "cvs", "tech-lead.md"),
      "---\nname: Tech Lead\nuse_for: EM roles\n---\nLed a team of 6.\n",
    );
    writeFileSync(join(dir, "cvs", "broken.md"), "no header\n");
    await request(app).post("/profile/reload").expect(200);
    const after = await request(app).get("/profile/status").expect(200);
    expect(after.body.variants).toEqual([
      { id: "tech-lead", name: "Tech Lead", useFor: "EM roles" },
    ]);
    expect(after.body.variantsHash).toMatch(/^[0-9a-f]{16}$/);
    expect(after.body.variantErrors).toEqual([
      "cvs/broken.md: missing the --- name / use_for --- header",
    ]);
    expect(ctx.profile.get()?.variants?.[0]?.text).toBe("Led a team of 6.");
  });
});

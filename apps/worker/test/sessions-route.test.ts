import { BrowserMissingError, type BrowserSessions } from "@job-radar/sources";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { testContext } from "./helpers";

describe("login without the browser installed", () => {
  it("answers browser_missing so the app can ask before downloading", async () => {
    const ctx = testContext();
    const browser = {
      browserInstalled: () => false,
      browserName: () => "Chromium",
      activeLogin: () => null,
      hasProfile: () => false,
      startLogin: async () => {
        throw new BrowserMissingError();
      },
    } as unknown as BrowserSessions;
    const app = createApp({ ...ctx, browser });
    const res = await request(app).post("/sessions/linkedin/login");
    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({ code: "browser_missing" });
    expect((await request(app).get("/sessions")).body).toMatchObject({ browserInstalled: false });
  });
});

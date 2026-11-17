import { createNotification, updateSource, upsertSource } from "@job-radar/db";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Scheduler } from "../src/ingest/scheduler";
import type { ScoringService } from "../src/scoring/service";
import { testContext } from "./helpers";

function fakeScheduler(busy: string[]) {
  const runs: string[] = [];
  const scheduler = {
    isBusy: (id: string) => busy.includes(id),
    runNow: (id: string) => {
      if (busy.includes(id)) return "already_running" as const;
      runs.push(id);
      return "started" as const;
    },
  } as unknown as Scheduler;
  return { scheduler, runs };
}

function setup(llm: "ok" | "not_authenticated" = "ok", pausedUntil: string | null = null) {
  const ctx = testContext();
  upsertSource(ctx.db, { id: "ashby", type: "ashby", name: "Ashby", enabled: true });
  upsertSource(ctx.db, { id: "hn", type: "hn_hiring", name: "Hacker News", enabled: true });
  upsertSource(ctx.db, { id: "off", type: "remoteok", name: "RemoteOK", enabled: false });
  const { scheduler, runs } = fakeScheduler(["hn"]);
  const scoring = {
    status: () => ({ llm, llmMessage: llm === "ok" ? null : "Run claude", pausedUntil }),
  } as unknown as ScoringService;
  return { ...ctx, runs, app: createApp({ ...ctx, scheduler, scoring }) };
}

describe("status for the menu bar", () => {
  it("identifies Job Radar on /health", async () => {
    const s = setup();
    expect((await request(s.app).get("/health")).body).toMatchObject({
      ok: true,
      app: "job-radar",
    });
  });

  it("summarizes unread notifications, running sources and the overall state", async () => {
    const s = setup();
    createNotification(s.db, { kind: "strong_match", title: "A", body: "a" });
    const res = await request(s.app).get("/status/summary");
    expect(res.body).toMatchObject({ overall: "ok", unread: 1, running: ["hn"], attention: [] });
  });

  it("flags Claude login problems, expired sessions and the LLM pause", async () => {
    const s = setup("not_authenticated");
    updateSource(s.db, "ashby", { status: "session_expired" });
    const res = await request(s.app).get("/status/summary");
    expect(res.body).toMatchObject({
      overall: "attention",
      llm: "not_authenticated",
      attention: [{ id: "ashby", status: "session_expired" }],
    });
    const paused = setup("ok", "2026-11-18T00:00:00.000Z");
    expect((await request(paused.app).get("/status/summary")).body.overall).toBe("paused");
  });

  it("runs every enabled source that is not already running", async () => {
    const s = setup();
    const res = await request(s.app).post("/sources/run-all");
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ started: ["ashby"], skipped: ["hn"] });
    expect(s.runs).toEqual(["ashby"]);
  });
});

import { getSource, listNotifications, listRuns, updateSource, upsertSource } from "@job-radar/db";
import { SessionExpiredError, type SourceAdapter } from "@job-radar/sources";
import { describe, expect, it } from "vitest";
import { executeRun, type RunnerDeps } from "../src/ingest/runner";
import { Scheduler } from "../src/ingest/scheduler";
import { Notifier } from "../src/notifier";
import { testContext } from "./helpers";

function setup(adapter: SourceAdapter, enabled: boolean) {
  const ctx = testContext();
  upsertSource(ctx.db, {
    id: "upwork",
    type: "upwork",
    name: "Upwork (logged-in)",
    requiresLogin: true,
    enabled,
  });
  const deps: RunnerDeps = {
    db: ctx.db,
    profile: ctx.profile,
    notifier: new Notifier(ctx.db),
    dataDir: "/x",
    adapters: { upwork: adapter },
  };
  return { ...ctx, deps };
}

describe("logged-in sources in the runner", () => {
  it("never run while disabled, not even with Run now", async () => {
    let calls = 0;
    const s = setup(
      {
        type: "upwork",
        label: "Upwork",
        defaultIntervalMinutes: 60,
        requiresLogin: true,
        fetchOffers: async () => (calls++, []),
      },
      false,
    );
    const scheduler = new Scheduler(s.deps);
    expect(scheduler.tick()).toEqual([]);
    expect(scheduler.runNow("upwork")).toBe("disabled");
    expect(await executeRun(s.deps, "upwork", "manual")).toEqual({ status: "disabled" });
    await scheduler.idle();
    expect(calls).toBe(0);
    expect(listRuns(s.db, "upwork")).toEqual([]);
  });

  it("marks 'session expired', notifies once and pauses runs until the owner logs in again", async () => {
    const s = setup(
      {
        type: "upwork",
        label: "Upwork",
        defaultIntervalMinutes: 60,
        requiresLogin: true,
        fetchOffers: () => Promise.reject(new SessionExpiredError("upwork")),
      },
      true,
    );
    await executeRun(s.deps, "upwork", "schedule");
    const source = getSource(s.db, "upwork")!;
    expect(source.status).toBe("session_expired");
    expect(source.consecutiveFailures).toBe(0);
    expect(listRuns(s.db, "upwork")[0]?.error).toMatch(/session expired/);
    expect(listNotifications(s.db).filter((n) => n.kind === "session_expired")).toHaveLength(1);
    expect(new Scheduler(s.deps).tick(new Date(Date.now() + 86_400_000))).toEqual([]);
    updateSource(s.db, "upwork", { status: "ok" }); // after "Done" on a new login
    expect(new Scheduler(s.deps).tick(new Date(Date.now() + 86_400_000))).toEqual(["upwork"]);
  });
});

describe("logged-in source defaults", () => {
  it("start disabled and logged out until the owner logs in", async () => {
    const { syncSources } = await import("../src/ingest/sources-sync");
    const { loggedInAdapters, remoteOkAdapter } = await import("@job-radar/sources");
    const ctx = testContext();
    syncSources(
      ctx.db,
      Object.fromEntries([...loggedInAdapters, remoteOkAdapter].map((a) => [a.type, a])),
      ctx.profile.get()?.preferences ?? null,
    );
    expect(getSource(ctx.db, "linkedin")).toMatchObject({
      enabled: false,
      status: "logged_out",
      requiresLogin: true,
    });
    expect(getSource(ctx.db, "remoteok")).toMatchObject({ status: "ok" });
  });
});

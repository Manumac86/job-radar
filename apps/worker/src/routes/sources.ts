import { lastRun, listRuns, listSources } from "@job-radar/db";
import { Router } from "express";
import type { WorkerContext } from "../context";

export function sourceRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/sources", (_req, res) => {
    res.json(
      listSources(ctx.db).map((s) => ({
        ...s,
        running: ctx.scheduler?.isBusy(s.id) ?? false,
        lastRun: lastRun(ctx.db, s.id) ?? null,
      })),
    );
  });
  r.get("/sources/:id/runs", (req, res) => {
    res.json(listRuns(ctx.db, req.params.id, 50));
  });
  r.post("/sources/:id/run", (req, res) => {
    if (!ctx.scheduler) return void res.status(503).json({ error: "Scheduler is not running" });
    const result = ctx.scheduler.runNow(req.params.id);
    const status = {
      started: 202,
      queued: 202,
      already_running: 409,
      not_found: 404,
      disabled: 409,
    }[result];
    res.status(status).json({
      result,
      message:
        result === "already_running" ? "A run is already in progress for this source" : undefined,
    });
  });
  return r;
}

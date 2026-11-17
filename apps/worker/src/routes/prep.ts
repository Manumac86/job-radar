import { latestInterviewPrep } from "@job-radar/db";
import { Router } from "express";
import type { WorkerContext } from "../context";
import { PrepError } from "../pipeline/prep";

export function prepRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/applications/:id/prep", (req, res) => {
    const prep = latestInterviewPrep(ctx.db, Number(req.params.id));
    if (!prep) return void res.status(404).json({ error: "No interview prep yet" });
    res.json(prep);
  });
  /** Generate (or regenerate) the plan for the application's current stage. */
  r.post("/applications/:id/prep", async (req, res) => {
    if (!ctx.prep) return void res.status(503).json({ error: "Interview prep is not running" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ error: "Invalid id" });
    try {
      res.status(201).json(await ctx.prep.generate(id));
    } catch (err) {
      if (err instanceof PrepError) return void res.status(err.status).json({ error: err.message });
      throw err;
    }
  });
  /** A stage changed in the web app: prepare automatically when it is an interview stage. */
  r.post("/applications/:id/stage-changed", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ error: "Invalid id" });
    void ctx.prep?.autoPrepare(id);
    res.status(202).json({ queued: Boolean(ctx.prep) });
  });
  return r;
}

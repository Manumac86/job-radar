import { Router } from "express";
import type { WorkerContext } from "../context";

export function scoringRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/scoring/status", (_req, res) => {
    if (!ctx.scoring) return void res.status(503).json({ error: "Scoring is not running" });
    res.json(ctx.scoring.status());
  });
  r.post("/scoring/rescore-open", (_req, res) => {
    if (!ctx.scoring) return void res.status(503).json({ error: "Scoring is not running" });
    if (!ctx.profile.get())
      return void res.status(409).json({ error: "Profile is invalid; fix it first" });
    res.status(202).json({ queued: ctx.scoring.rescoreOpen() });
  });
  r.post("/offers/:id/score", (req, res) => {
    if (!ctx.scoring) return void res.status(503).json({ error: "Scoring is not running" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return void res.status(400).json({ error: "Invalid offer id" });
    if (!ctx.scoring.retry(id)) return void res.status(404).json({ error: "Offer not found" });
    res.status(202).json({ queued: true });
  });
  return r;
}

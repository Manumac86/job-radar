import { Router } from "express";
import type { WorkerContext } from "../context";
import { LearningError } from "../learning/service";

export function learningRoutes(ctx: WorkerContext): Router {
  const r = Router();
  /** "Learn now" in Settings. */
  r.post("/learning/run", async (_req, res) => {
    if (!ctx.learning) return void res.status(503).json({ error: "Learning is not running" });
    try {
      res.json(await ctx.learning.run("manual"));
    } catch (err) {
      if (err instanceof LearningError)
        return void res.status(err.status).json({ error: err.message });
      throw err;
    }
  });
  /** The web recorded a dismissal or shortlist: refresh suggestions, learn at the threshold. */
  r.post("/learning/feedback-added", (_req, res) => {
    void ctx.learning?.feedbackAdded();
    res.status(202).json({ queued: Boolean(ctx.learning) });
  });
  return r;
}

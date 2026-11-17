import { Router } from "express";
import type { WorkerContext } from "../context";

export function profileRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/profile/status", (_req, res) => {
    const status = ctx.profile.status();
    res.status(200).json({ ...status, lastSuccessfulLoadAt: ctx.profile.lastSuccessfulLoad() });
  });
  r.post("/profile/reload", (_req, res) => {
    const status = ctx.profile.reload();
    res.status(status.status === "ok" ? 200 : 422).json(status);
  });
  return r;
}

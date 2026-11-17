import { Router } from "express";
import { RESEARCH_REASONS, type ResearchReason } from "@job-radar/db";
import type { WorkerContext } from "../context";
import { ResearchError } from "../research/service";

export function researchRoutes(ctx: WorkerContext): Router {
  const r = Router();
  /** Research a company: manual (button), shortlist (web triage) or refresh (`force=1`). */
  r.post("/companies/:id/research", (req, res) => {
    if (!ctx.research) return void res.status(503).json({ error: "Research is not running" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return void res.status(400).json({ error: "Invalid company id" });
    const reasonParam = String(req.query["reason"] ?? "manual");
    const reason: ResearchReason = (RESEARCH_REASONS as readonly string[]).includes(reasonParam)
      ? (reasonParam as ResearchReason)
      : "manual";
    const body = (req.body ?? {}) as { offerId?: unknown };
    const offerId = Number.isInteger(body.offerId) ? (body.offerId as number) : null;
    try {
      const out = ctx.research.request(id, {
        offerId,
        reason,
        force: req.query["force"] === "1",
      });
      res.status(out.kind === "queued" ? 202 : 200).json({
        outcome: out.kind,
        status: out.row.status,
        error: out.row.error,
      });
    } catch (err) {
      if (err instanceof ResearchError)
        return void res.status(err.status).json({ error: err.message });
      throw err;
    }
  });
  r.get("/companies/:id/research", (req, res) => {
    if (!ctx.research) return void res.status(503).json({ error: "Research is not running" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return void res.status(400).json({ error: "Invalid company id" });
    const st = ctx.research.state(id);
    res.json({ ...st, remaining: ctx.research.remaining() });
  });
  return r;
}

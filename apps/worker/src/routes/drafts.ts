import { listDrafts } from "@job-radar/db";
import { Router } from "express";
import { z } from "zod";
import type { WorkerContext } from "../context";
import { DraftError } from "../drafts/service";

const body = z.object({ instruction: z.string().trim().max(500).optional().nullable() }).strict();

export function draftRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/offers/:id/drafts", (req, res) => {
    res.json(listDrafts(ctx.db, Number(req.params.id)));
  });
  /** Generate a draft, or regenerate with an instruction ("shorter, emphasize RAG"). */
  r.post("/offers/:id/drafts", async (req, res) => {
    if (!ctx.drafts) return void res.status(503).json({ error: "Drafting is not running" });
    const id = Number(req.params.id);
    const parsed = body.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      return void res.status(400).json({ error: "Invalid request" });
    }
    try {
      const draft = await ctx.drafts.generate(id, { instruction: parsed.data.instruction || null });
      res.status(201).json(draft);
    } catch (err) {
      if (err instanceof DraftError)
        return void res.status(err.status).json({ error: err.message });
      throw err;
    }
  });
  return r;
}

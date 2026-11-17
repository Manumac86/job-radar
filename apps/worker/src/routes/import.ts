import { Router } from "express";
import { z } from "zod";
import type { WorkerContext } from "../context";
import { ImportError, importOffer } from "../ingest/import";

const body = z
  .object({
    url: z.string().trim().min(8).max(2000),
    text: z.string().max(30_000).optional().nullable(),
    appliedAt: z.iso.datetime().optional().nullable(),
  })
  .strict();

export function importRoutes(ctx: WorkerContext): Router {
  const r = Router();
  /** Offers → "Add from link". One GET of a public page; nothing is sent to the site. */
  r.post("/offers/import", async (req, res) => {
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: "Invalid request" });
    try {
      const result = await importOffer(ctx, {
        url: parsed.data.url,
        text: parsed.data.text ?? null,
        appliedAt: parsed.data.appliedAt ? new Date(parsed.data.appliedAt) : null,
      });
      res.status(result.existed ? 200 : 201).json(result);
    } catch (err) {
      if (err instanceof ImportError) return void res.status(422).json({ error: err.message });
      throw err;
    }
  });
  return r;
}

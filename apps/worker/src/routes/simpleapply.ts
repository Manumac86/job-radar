import express, { Router } from "express";
import type { WorkerContext } from "../context";
import { SimpleApplyCsvError, importSimpleApplyCsv } from "../ingest/simpleapply-import";

export function simpleApplyRoutes(ctx: WorkerContext): Router {
  const r = Router();
  /** Offers → Import → SimpleApply CSV. The body is the file's text; nothing is fetched. */
  r.post("/offers/import-csv", express.text({ type: "text/csv", limit: "6mb" }), (req, res) => {
    if (typeof req.body !== "string" || !req.body.trim())
      return void res.status(400).json({ error: "Send the CSV file as text/csv" });
    try {
      res.status(201).json(importSimpleApplyCsv(ctx, req.body));
    } catch (err) {
      if (err instanceof SimpleApplyCsvError)
        return void res.status(422).json({ error: err.message });
      throw err;
    }
  });
  return r;
}

// Portal status updates (mygreenhouse-source D4): suggestions, per-application history and the
// owner's Undo, Apply and Dismiss.
import { pendingPortalSuggestions, portalUpdatesForApplication } from "@job-radar/db";
import { Router, type Response } from "express";
import type { WorkerContext } from "../context";
import { PortalError } from "../portal/service";

function id(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function fail(res: Response, err: unknown): void {
  if (err instanceof PortalError) res.status(err.status).json({ error: err.message });
  else throw err;
}

export function portalRoutes(ctx: WorkerContext): Router {
  const r = Router();

  r.get("/portal/suggestions", (_req, res) => {
    res.json(pendingPortalSuggestions(ctx.db));
  });

  r.get("/applications/:id/portal-updates", (req, res) => {
    const appId = id(req.params.id);
    if (!appId) return void res.status(400).json({ error: "Invalid id" });
    res.json(portalUpdatesForApplication(ctx.db, appId));
  });

  for (const action of ["undo", "apply", "dismiss"] as const) {
    r.post(`/portal/updates/:id/${action}`, (req, res) => {
      if (!ctx.portal)
        return void res.status(503).json({ error: "Portal updates are not available" });
      const rowId = id(req.params.id);
      if (!rowId) return void res.status(400).json({ error: "Invalid id" });
      const body = (req.body ?? {}) as { applicationId?: unknown };
      try {
        const result =
          action === "undo"
            ? ctx.portal.undo(rowId)
            : action === "dismiss"
              ? ctx.portal.dismiss(rowId)
              : ctx.portal.apply(
                  rowId,
                  body.applicationId === undefined
                    ? undefined
                    : (id(String(body.applicationId)) ?? -1),
                );
        res.status(result.ok ? 200 : 409).json(result);
      } catch (err) {
        fail(res, err);
      }
    });
  }
  return r;
}

// Status for the macOS app's menu bar (desktop-app spec, "Menu bar"; design D8).
import { listSources, unreadCount } from "@job-radar/db";
import { Router } from "express";
import type { WorkerContext } from "../context";

export interface StatusSummary {
  overall: "ok" | "paused" | "attention";
  llm: "ok" | "not_authenticated" | "unavailable" | "unknown";
  llmMessage: string | null;
  pausedUntil: string | null;
  attention: { id: string; name: string; status: string }[];
  unread: number;
  running: string[];
}

export function statusSummary(ctx: WorkerContext): StatusSummary {
  const sources = listSources(ctx.db).filter((s) => s.enabled);
  const scoring = ctx.scoring?.status();
  const llm = scoring?.llm ?? "unknown";
  const attention = sources
    .filter((s) => s.status !== "ok")
    .map((s) => ({ id: s.id, name: s.name, status: s.status }));
  const pausedUntil = scoring?.pausedUntil ?? null;
  const overall =
    llm === "not_authenticated" || llm === "unavailable" || attention.length
      ? "attention"
      : pausedUntil
        ? "paused"
        : "ok";
  return {
    overall,
    llm,
    llmMessage: scoring?.llmMessage ?? null,
    pausedUntil,
    attention,
    unread: unreadCount(ctx.db),
    running: sources.filter((s) => ctx.scheduler?.isBusy(s.id)).map((s) => s.id),
  };
}

export function statusRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/status/summary", (_req, res) => {
    res.json(statusSummary(ctx));
  });
  /** "Run all sources now" from the menu bar: every enabled source not already running. */
  r.post("/sources/run-all", (_req, res) => {
    if (!ctx.scheduler) return void res.status(503).json({ error: "Scheduler is not running" });
    const started: string[] = [];
    const skipped: string[] = [];
    for (const s of listSources(ctx.db).filter((x) => x.enabled)) {
      const result = ctx.scheduler.runNow(s.id);
      (result === "started" || result === "queued" ? started : skipped).push(s.id);
    }
    res.status(202).json({ started, skipped });
  });
  return r;
}

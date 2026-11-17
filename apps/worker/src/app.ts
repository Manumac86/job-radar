import express, { type ErrorRequestHandler } from "express";
import type { WorkerContext } from "./context";
import { errorMessage, log } from "./log";
import { draftRoutes } from "./routes/drafts";
import { importRoutes } from "./routes/import";
import { prepRoutes } from "./routes/prep";
import { learningRoutes } from "./routes/learning";
import { researchRoutes } from "./routes/research";
import { statusRoutes } from "./routes/status";
import { notificationRoutes, telegramRoutes } from "./routes/notifications";
import { profileRoutes } from "./routes/profile";
import { scoringRoutes } from "./routes/scoring";
import { sessionRoutes } from "./routes/sessions";
import { sourceRoutes } from "./routes/sources";

export function createApp(ctx: WorkerContext) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    // "app" lets the macOS app tell a running Job Radar apart from another service on the port.
    res.json({ ok: true, app: "job-radar", profile: ctx.profile.status().status });
  });
  app.use(profileRoutes(ctx));
  app.use(statusRoutes(ctx));
  app.use(sourceRoutes(ctx));
  app.use(scoringRoutes(ctx));
  app.use(draftRoutes(ctx));
  app.use(prepRoutes(ctx));
  app.use(importRoutes(ctx));
  app.use(learningRoutes(ctx));
  app.use(researchRoutes(ctx));
  app.use(notificationRoutes(ctx));
  app.use(telegramRoutes(ctx));
  app.use(sessionRoutes(ctx));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    log.error("request failed", { error: errorMessage(err) });
    res.status(500).json({ error: errorMessage(err) });
  };
  app.use(onError);
  return app;
}

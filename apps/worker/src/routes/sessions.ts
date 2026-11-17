import { getSource, listSources, updateSource } from "@job-radar/db";
import { BrowserMissingError, LOGGED_IN_SITES } from "@job-radar/sources";
import { Router } from "express";
import type { WorkerContext } from "../context";
import { errorMessage } from "../log";

/**
 * Login sessions (browser-sessions spec). The owner logs in by hand in the isolated browser;
 * these endpoints never receive credentials.
 */
export function sessionRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/sessions", (_req, res) => {
    res.json({
      available: Boolean(ctx.browser),
      browserInstalled: ctx.browser?.browserInstalled() ?? false,
      browser: ctx.browser?.browserName() ?? null,
      activeLogin: ctx.browser?.activeLogin() ?? null,
      profileExists: ctx.browser?.hasProfile() ?? false,
      sites: listSources(ctx.db)
        .filter((s) => s.requiresLogin)
        .map((s) => ({ id: s.id, name: s.name, status: s.status, enabled: s.enabled })),
    });
  });

  r.post("/sessions/:site/login", async (req, res) => {
    const site = LOGGED_IN_SITES[req.params.site];
    if (!ctx.browser)
      return void res.status(503).json({ error: "The isolated browser is not available" });
    if (!site) return void res.status(404).json({ error: "Unknown site" });
    try {
      const { viewerUrl } = await ctx.browser.startLogin(site);
      res.status(201).json({
        site: site.id,
        viewerUrl,
        message: viewerUrl
          ? `Open ${viewerUrl}, log in with your password manager and 2FA, then click Done.`
          : `A ${ctx.browser.browserName()} window opened with the isolated profile (separate from your everyday browser). Log in there, then click Done.`,
      });
    } catch (err) {
      if (err instanceof BrowserMissingError)
        return void res.status(412).json({ error: err.message, code: err.code });
      res.status(409).json({ error: errorMessage(err) });
    }
  });

  r.post("/sessions/done", async (_req, res) => {
    if (!ctx.browser)
      return void res.status(503).json({ error: "The isolated browser is not available" });
    const siteId = await ctx.browser.finishLogin();
    if (!siteId) return void res.status(409).json({ error: "No login in progress" });
    const site = LOGGED_IN_SITES[siteId];
    let status: "ok" | "logged_out" = "ok";
    try {
      if (site) status = await ctx.browser.checkSession(site);
    } catch {
      status = "ok"; // could not verify now; the next run checks again
    }
    if (getSource(ctx.db, siteId)) updateSource(ctx.db, siteId, { status, consecutiveFailures: 0 });
    res.json({ site: siteId, status });
  });

  /** Live check: opens the site once, read-only, and records whether the session is valid. */
  r.post("/sessions/:site/check", async (req, res) => {
    const site = LOGGED_IN_SITES[req.params.site];
    if (!ctx.browser)
      return void res.status(503).json({ error: "The isolated browser is not available" });
    if (!site) return void res.status(404).json({ error: "Unknown site" });
    try {
      const status = await ctx.browser.checkSession(site);
      if (getSource(ctx.db, site.id)) updateSource(ctx.db, site.id, { status });
      res.json({ site: site.id, status });
    } catch (err) {
      res.status(409).json({ error: errorMessage(err) });
    }
  });

  r.post("/sessions/delete-profile", async (_req, res) => {
    if (!ctx.browser)
      return void res.status(503).json({ error: "The isolated browser is not available" });
    try {
      await ctx.browser.deleteProfile();
    } catch (err) {
      return void res.status(409).json({ error: errorMessage(err) });
    }
    for (const s of listSources(ctx.db).filter((x) => x.requiresLogin)) {
      updateSource(ctx.db, s.id, { status: "logged_out" });
    }
    res.json({ deleted: true });
  });
  return r;
}

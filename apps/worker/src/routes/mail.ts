// Email accounts and replies to applications (application-emails). Passwords go in, never out.
import { emailsForApplication, pendingEmailSuggestions } from "@job-radar/db";
import { Router, type Response } from "express";
import { z } from "zod";
import type { WorkerContext } from "../context";
import { MailError } from "../mail/service";

const folder = z.string().trim().min(1).max(200);
const account = z
  .object({
    label: z.string().trim().min(1).max(60),
    address: z.string().trim().min(3).max(200).includes("@"),
    host: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .regex(/^[a-z0-9.-]+$/i, "Host name only, e.g. imap.example.com"),
    port: z.number().int().min(1).max(65535).optional(),
    folders: z.array(folder).max(10).optional(),
    enabled: z.boolean().optional(),
    jobAlerts: z.boolean().optional(),
    alertFolders: z.array(folder).max(10).optional(),
    alertsInInbox: z.boolean().optional(),
    password: z.string().max(500).optional().nullable(),
  })
  .strict();

function id(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function fail(res: Response, err: unknown): void {
  if (err instanceof MailError) return void res.status(err.status).json({ error: err.message });
  throw err;
}

export function mailRoutes(ctx: WorkerContext): Router {
  const r = Router();
  const unavailable = (res: Response) =>
    void res.status(503).json({ error: "Email checking is not running" });

  r.get("/mail/accounts", (_req, res) => {
    if (!ctx.mail) return unavailable(res);
    res.json(ctx.mail.listAccounts());
  });

  r.post("/mail/accounts", (req, res) => {
    if (!ctx.mail) return unavailable(res);
    const parsed = account.safeParse(req.body ?? {});
    if (!parsed.success) {
      return void res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid account" });
    }
    const { password, ...input } = parsed.data;
    res.status(201).json(ctx.mail.createAccount(input, password ?? null));
  });

  r.patch("/mail/accounts/:id", (req, res) => {
    if (!ctx.mail) return unavailable(res);
    const accountId = id(req.params.id);
    const parsed = account.partial().safeParse(req.body ?? {});
    if (!accountId || !parsed.success)
      return void res.status(400).json({ error: "Invalid request" });
    const { password, ...patch } = parsed.data;
    try {
      res.json(ctx.mail.updateAccount(accountId, patch, password ?? null));
    } catch (err) {
      fail(res, err);
    }
  });

  r.delete("/mail/accounts/:id", (req, res) => {
    if (!ctx.mail) return unavailable(res);
    const accountId = id(req.params.id);
    if (!accountId) return void res.status(400).json({ error: "Invalid id" });
    ctx.mail.deleteAccount(accountId);
    res.status(204).end();
  });

  r.post("/mail/accounts/:id/test", async (req, res) => {
    if (!ctx.mail) return unavailable(res);
    const accountId = id(req.params.id);
    if (!accountId) return void res.status(400).json({ error: "Invalid id" });
    try {
      res.json(await ctx.mail.testAccount(accountId));
    } catch (err) {
      fail(res, err);
    }
  });

  /** Check every enabled account now, or one with `{ accountId }`. */
  r.post("/mail/check", async (req, res) => {
    if (!ctx.mail) return unavailable(res);
    const body = (req.body ?? {}) as { accountId?: unknown };
    const accountId = body.accountId === undefined ? undefined : id(String(body.accountId));
    if (accountId === null) return void res.status(400).json({ error: "Invalid account" });
    res.json(await ctx.mail.check(accountId));
  });

  r.get("/mail/suggestions", (_req, res) => {
    res.json(pendingEmailSuggestions(ctx.db));
  });

  r.get("/applications/:id/emails", (req, res) => {
    const appId = id(req.params.id);
    if (!appId) return void res.status(400).json({ error: "Invalid id" });
    res.json(emailsForApplication(ctx.db, appId));
  });

  for (const action of ["undo", "apply", "dismiss"] as const) {
    r.post(`/mail/emails/:id/${action}`, (req, res) => {
      if (!ctx.mail) return unavailable(res);
      const emailId = id(req.params.id);
      if (!emailId) return void res.status(400).json({ error: "Invalid id" });
      const body = (req.body ?? {}) as { applicationId?: unknown };
      try {
        const result =
          action === "undo"
            ? ctx.mail.undo(emailId)
            : action === "dismiss"
              ? ctx.mail.dismiss(emailId)
              : ctx.mail.apply(
                  emailId,
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

import {
  listNotifications,
  markNotificationUnread,
  markNotificationsRead,
  unreadCount,
} from "@job-radar/db";
import { Router } from "express";
import { z } from "zod";
import type { WorkerContext } from "../context";

const readBody = z.union([
  z.object({ ids: z.array(z.number().int()).min(1) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

export function notificationRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/notifications", (req, res) => {
    res.json({
      unread: unreadCount(ctx.db),
      items: listNotifications(ctx.db, { unreadOnly: req.query["unread"] === "1", limit: 200 }),
    });
  });
  r.post("/notifications/read", (req, res) => {
    const parsed = readBody.safeParse(req.body);
    if (!parsed.success)
      return void res.status(400).json({ error: "Send { ids: number[] } or { all: true }" });
    const changed = markNotificationsRead(ctx.db, "all" in parsed.data ? "all" : parsed.data.ids);
    res.json({ changed, unread: unreadCount(ctx.db) });
  });
  r.post("/notifications/:id/unread", (req, res) => {
    markNotificationUnread(ctx.db, Number(req.params.id));
    res.json({ unread: unreadCount(ctx.db) });
  });
  return r;
}

export function telegramRoutes(ctx: WorkerContext): Router {
  const r = Router();
  r.get("/telegram/status", (_req, res) => {
    res.json(
      ctx.telegram
        ? { configured: true, quietHours: ctx.telegram.inQuietHours() }
        : {
            configured: false,
            howTo: [
              "Create a bot with @BotFather and copy its token.",
              "Save the token to secrets/telegram_bot_token.",
              "Send any message to your bot, then save your chat id to secrets/telegram_chat_id (it appears in https://api.telegram.org/bot<token>/getUpdates).",
              "Restart the worker.",
            ],
          },
    );
  });
  return r;
}

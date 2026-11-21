import { getOffer, insertApplicationEmail, listNotifications } from "@job-radar/db";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Notifier } from "../src/notifier";
import { createDigestIfDue } from "../src/notifications/digest";
import { strongMatchNotification } from "../src/notifications/messages";
import { HttpError } from "grammy";
import { registerSecret } from "../src/log";
import { TelegramService, telegramError } from "../src/notifications/telegram";
import { seedScoredOffer, testContext } from "./helpers";

const OWNER = "424242";
const TOKEN = "123456:TEST-TOKEN";

interface Call {
  method: string;
  body: Record<string, unknown>;
}

let server: Server | null = null;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

/** A mock Telegram Bot API on 127.0.0.1 that records every call. */
async function mockTelegram(): Promise<{ apiRoot: string; calls: Call[] }> {
  const calls: Call[] = [];
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const method = (req.url ?? "").split("/").pop() ?? "";
      calls.push({ method, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} });
      const result =
        method === "getMe"
          ? {
              id: 1,
              is_bot: true,
              first_name: "Radar",
              username: "radar_bot",
              can_join_groups: false,
              can_read_all_group_messages: false,
              supports_inline_queries: false,
            }
          : { message_id: calls.length, date: 0, chat: { id: Number(OWNER), type: "private" } };
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  return { apiRoot: `http://127.0.0.1:${(server!.address() as AddressInfo).port}`, calls };
}

async function setup(now: () => Date) {
  const api = await mockTelegram();
  const ctx = testContext();
  const telegram = new TelegramService({
    token: TOKEN,
    ownerChatId: OWNER,
    db: ctx.db,
    profile: ctx.profile,
    webBaseUrl: "http://localhost:3000",
    apiRoot: api.apiRoot,
    now,
  });
  const notifier = new Notifier(ctx.db);
  notifier.onCreated((n) => telegram.deliver(n));
  // Waits until at least `expected` messages were sent (up to 5 s), then a little longer so an
  // unexpected extra message would still be caught. A fixed sleep was flaky under load.
  const flush = async (expected = 1) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 100 && sends(api.calls).length < expected; i++) await sleep(50);
    await sleep(100);
  };
  return { ...ctx, ...api, telegram, notifier, flush };
}

const sends = (calls: Call[]) => calls.filter((c) => c.method === "sendMessage");

describe("Telegram alerts (mocked Bot API)", () => {
  it("sends one strong-match alert per offer to the owner chat, with local and source links", async () => {
    const s = await setup(() => new Date("2026-11-15T12:00:00Z")); // 12:00 Lisbon (example profile)
    const { offer, score } = seedScoredOffer(s);
    s.notifier.notify(strongMatchNotification(offer, score));
    s.notifier.notify(strongMatchNotification(offer, score));
    await s.flush();
    const sent = sends(s.calls);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ chat_id: OWNER, parse_mode: "HTML" });
    const text = String(sent[0]!.body["text"]);
    expect(text).toContain(`<b>Strong match 88: Senior AI Engineer at ${offer.companyName}</b>`);
    expect(text).toContain(`href="http://localhost:3000/offers/${offer.id}"`);
    expect(text).toContain(`href="${getOffer(s.db, offer.id)!.sourceUrl}"`);
    expect(listNotifications(s.db)[0]?.telegramStatus).toBe("sent");
  });

  it("holds alerts during quiet hours and delivers them in one digest when they end", async () => {
    let now = new Date("2026-11-15T23:30:00Z"); // 23:30 Lisbon
    const s = await setup(() => now);
    const a = seedScoredOffer(s);
    const b = seedScoredOffer(s, 91);
    s.notifier.notify(strongMatchNotification(a.offer, a.score));
    s.notifier.notify(strongMatchNotification(b.offer, b.score));
    s.notifier.notify({
      kind: "interview_reminder",
      title: "Interview tomorrow 09:00",
      body: "Acme",
    });
    await s.flush();
    // The interview reminder is urgent; strong matches are held.
    expect(sends(s.calls)).toHaveLength(1);
    expect(listNotifications(s.db).filter((n) => n.telegramStatus === "held")).toHaveLength(2);
    expect(await s.telegram.flushHeld()).toBe(0); // still quiet
    now = new Date("2026-11-16T08:05:00Z"); // 08:05 Lisbon
    expect(await s.telegram.flushHeld()).toBe(2);
    const digest = String(sends(s.calls)[1]!.body["text"]);
    expect(digest).toContain("<b>While you were away (2)</b>");
    expect(listNotifications(s.db).every((n) => n.telegramStatus === "sent")).toBe(true);
  });

  it("sends the daily digest once at the configured time", async () => {
    let now = new Date("2026-11-16T08:29:00Z"); // 08:29 Lisbon
    const s = await setup(() => now);
    seedScoredOffer(s, 85);
    // SQLite stamps the score with the real clock: move it inside this test's digest window.
    s.db.$client
      .prepare("update scores set created_at = ?")
      .run(new Date("2026-11-16T08:00:00Z").getTime());
    const deps = {
      db: s.db,
      profile: s.profile,
      notifier: s.notifier,
      webBaseUrl: "http://localhost:3000",
    };
    expect(createDigestIfDue(deps, now)).toBe(false);
    now = new Date("2026-11-16T08:31:00Z");
    expect(createDigestIfDue(deps, now)).toBe(true);
    expect(createDigestIfDue(deps, new Date("2026-11-16T12:00:00Z"))).toBe(false);
    await s.flush();
    const text = String(sends(s.calls)[0]!.body["text"]);
    expect(text).toContain("<b>Daily digest: 1 strong, 0 possible</b>");
    expect(text).toContain("<b>Top offers (last 24 h)</b>");
    expect(text).toContain("Awaiting response:</b> 0 applications");
    expect(listNotifications(s.db).find((n) => n.kind === "digest")?.telegramStatus).toBe("sent");
  });

  it("never replies to a stranger chat, and answers the owner", async () => {
    const s = await setup(() => new Date("2026-11-15T11:00:00Z"));
    await s.telegram.bot.init();
    const update = (chatId: number, text: string, updateId: number) => ({
      update_id: updateId,
      message: {
        message_id: updateId,
        date: 0,
        text,
        chat: { id: chatId, type: "private" as const, first_name: "x" },
        from: { id: chatId, is_bot: false, first_name: "x" },
        entities: [{ type: "bot_command" as const, offset: 0, length: text.length }],
      },
    });
    await s.telegram.bot.handleUpdate(update(999, "/start", 1));
    await s.telegram.bot.handleUpdate(update(999, "/digest", 2));
    expect(sends(s.calls)).toHaveLength(0);
    await s.telegram.bot.handleUpdate(update(Number(OWNER), "/start", 3));
    expect(sends(s.calls)).toHaveLength(1);
    expect(sends(s.calls)[0]!.body["chat_id"]).toBe(Number(OWNER));
  });

  it("keeps notifications in the app when Telegram is not configured", async () => {
    const ctx = testContext();
    const notifier = new Notifier(ctx.db);
    notifier.notify({ kind: "source_stopped", title: "x", body: "y" });
    expect(listNotifications(ctx.db)).toHaveLength(1);
  });
});

describe("email alerts with buttons", () => {
  function emailAlert(s: Awaited<ReturnType<typeof setup>>, status: "auto_applied" | "suggested") {
    const email = insertApplicationEmail(s.db, {
      messageId: `<${Math.random()}@x>`,
      folder: "INBOX",
      receivedAt: new Date("2026-11-15T10:00:00Z"),
      fromAddress: "ana@northwind.example",
      subject: "Next steps",
      candidates: [7],
      status,
    })!;
    const actions: string[] = [];
    s.telegram.setMail({
      undo: (id) => (
        actions.push(`undo:${id}`),
        { ok: actions.length === 1, message: actions.length === 1 ? "Undone" : "Already undone" }
      ),
      apply: (id) => (actions.push(`apply:${id}`), { ok: true, message: "Applied" }),
      dismiss: (id) => (actions.push(`dismiss:${id}`), { ok: true, message: "Dismissed" }),
    });
    s.notifier.notify({
      kind: "email_next_step",
      title: "interview invitation from Northwind",
      body: "Moved to Screening call.",
      dedupeKey: `email:${email.id}:email_next_step`,
    });
    return { email, actions };
  }

  const callback = (chatId: number, data: string, updateId: number) => ({
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      chat_instance: "1",
      data,
      from: { id: chatId, is_bot: false, first_name: "x" },
      message: {
        message_id: 5,
        date: 0,
        text: "interview invitation from Northwind\nMoved to Screening call.",
        chat: { id: chatId, type: "private" as const, first_name: "x" },
      },
    },
  });

  it("an automatic change carries an Undo button that edits the message, once", async () => {
    const s = await setup(() => new Date("2026-11-15T12:00:00Z"));
    const { email, actions } = emailAlert(s, "auto_applied");
    await s.flush(1);
    const markup = sends(s.calls)[0]!.body["reply_markup"] as {
      inline_keyboard: { text: string; callback_data: string }[][];
    };
    expect(markup.inline_keyboard[0]).toEqual([
      { text: "Undo", callback_data: `em:undo:${email.id}` },
    ]);
    await s.telegram.bot.init();
    await s.telegram.bot.handleUpdate(callback(Number(OWNER), `em:undo:${email.id}`, 10));
    const edit = s.calls.find((c) => c.method === "editMessageText");
    expect(edit?.body["text"]).toContain("<b>Undone</b>");
    await s.telegram.bot.handleUpdate(callback(Number(OWNER), `em:undo:${email.id}`, 11));
    const answers = s.calls.filter((c) => c.method === "answerCallbackQuery");
    expect(answers.at(-1)?.body["text"]).toBe("Already undone");
    expect(s.calls.filter((c) => c.method === "editMessageText")).toHaveLength(1);
    expect(actions).toEqual([`undo:${email.id}`, `undo:${email.id}`]);
  });

  it("a suggestion carries Apply and Dismiss; a stranger's button press does nothing", async () => {
    const s = await setup(() => new Date("2026-11-15T12:00:00Z"));
    const { email, actions } = emailAlert(s, "suggested");
    await s.flush(1);
    const markup = sends(s.calls)[0]!.body["reply_markup"] as {
      inline_keyboard: { text: string }[][];
    };
    expect(markup.inline_keyboard[0]!.map((b) => b.text)).toEqual(["Apply", "Dismiss"]);
    await s.telegram.bot.init();
    await s.telegram.bot.handleUpdate(callback(999, `em:apply:${email.id}`, 20));
    expect(actions).toEqual([]);
    expect(s.calls.some((c) => c.method === "answerCallbackQuery")).toBe(false);
  });

  it("email alerts are held during quiet hours", async () => {
    const s = await setup(() => new Date("2026-11-15T23:30:00Z"));
    emailAlert(s, "auto_applied");
    await new Promise((r) => setTimeout(r, 100));
    expect(sends(s.calls)).toHaveLength(0);
    expect(listNotifications(s.db)[0]?.telegramStatus).toBe("held");
  });
});

describe("telegramError", () => {
  it("shows a network error's cause, with the bot token redacted", () => {
    registerSecret("999:fake-bot-token");
    const err = new HttpError(
      "Network request for 'sendMessage' failed!",
      new Error("request to https://api.telegram.org/bot999:fake-bot-token/sendMessage failed"),
    );
    const text = telegramError(err);
    expect(text).toContain("Network request for 'sendMessage' failed!");
    expect(text).toContain("bot[redacted]/sendMessage failed");
    expect(text).not.toContain("fake-bot-token");
  });
});

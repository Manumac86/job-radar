// Telegram alerts (notifications spec, design D7): grammY with long polling, so nothing is
// exposed to the internet. The bot only talks to the owner's chat id.
import { appTimeZone, isWithinWindow } from "@job-radar/core";
import {
  getApplicationEmail,
  getPortalApplication,
  getOffer,
  notificationsWithTelegramStatus,
  setTelegramStatus,
  type Db,
  type Notification,
} from "@job-radar/db";
import { Bot, GrammyError, HttpError, InlineKeyboard, type Context } from "grammy";
import { errorMessage, log } from "../log";
import type { ProfileService } from "../profile-service";
import { buildDigest, escapeHtml } from "./digest";

/** A Telegram failure for the log: the API's description, or a network error with its cause. */
export function telegramError(err: unknown): string {
  if (err instanceof GrammyError) return err.description;
  if (err instanceof HttpError) return `${errorMessage(err)} (${errorMessage(err.error)})`;
  return errorMessage(err);
}

/** Kinds that go to Telegram; the rest stay in the in-app center only. */
export const TELEGRAM_KINDS = new Set<Notification["kind"]>([
  "strong_match",
  "interview_reminder",
  "session_expired",
  "source_stopped",
  "digest",
  "llm_unavailable",
  "email_next_step",
  "email_offer",
  "email_rejection",
  "portal_next_step",
  "portal_offer",
  "portal_rejection",
]);

/** The email actions the bot's buttons call (MailService). */
export interface MailActions {
  undo(emailId: number): { ok: boolean; message: string };
  apply(emailId: number): { ok: boolean; message: string };
  dismiss(emailId: number): { ok: boolean; message: string };
}

/** "portal:<id>:<status>" dedupe keys carry the portal update id for the buttons. */
export function portalUpdateIdOf(n: Pick<Notification, "dedupeKey">): number | null {
  const m = /^portal:(\d+):/.exec(n.dedupeKey ?? "");
  return m ? Number(m[1]) : null;
}

/** "email:<id>:<kind>" dedupe keys carry the email id for the buttons. */
export function emailIdOf(n: Pick<Notification, "dedupeKey">): number | null {
  const m = /^email:(\d+):/.exec(n.dedupeKey ?? "");
  return m ? Number(m[1]) : null;
}

/** `em:` acts on an email update, `pa:` on a portal update (mygreenhouse-source D5). */
const CALLBACK = /^(em|pa):(undo|apply|dismiss):(\d+)$/;
/** Sent even during quiet hours. */
const URGENT_KINDS = new Set<Notification["kind"]>(["interview_reminder"]);

const TZ_FALLBACK = appTimeZone();

export interface TelegramOptions {
  token: string;
  ownerChatId: string;
  db: Db;
  profile: ProfileService;
  webBaseUrl: string;
  /** Points grammY at a mock Telegram API in tests. */
  apiRoot?: string;
  now?: () => Date;
}

export class TelegramService {
  readonly bot: Bot;
  private readonly owner: string;
  private polling = false;
  private mail: MailActions | null = null;
  private portal: MailActions | null = null;

  constructor(private readonly o: TelegramOptions) {
    this.owner = String(o.ownerChatId).trim();
    this.bot = new Bot(o.token, o.apiRoot ? { client: { apiRoot: o.apiRoot } } : undefined);
    // Owner-only: every update from another chat is dropped without a reply, and logged.
    this.bot.use(async (ctx, next) => {
      const chatId = ctx.chat?.id !== undefined ? String(ctx.chat.id) : null;
      if (chatId !== this.owner) {
        log.warn("telegram: ignored update from another chat", {
          chatId,
          from: ctx.from?.id ?? null,
        });
        return;
      }
      await next();
    });
    this.bot.command("start", (ctx) =>
      ctx.reply(
        "Job Radar is connected. You will get strong matches, reminders and a daily digest here.",
      ),
    );
    this.bot.command("digest", async (ctx) => this.replyDigest(ctx));
    this.bot.command("status", (ctx) => ctx.reply(this.statusText()));
    // Email buttons. The owner-only middleware above already dropped other chats.
    this.bot.callbackQuery(CALLBACK, async (ctx) => this.onEmailButton(ctx));
    this.bot.catch((err) => log.error("telegram bot error", { error: errorMessage(err.error) }));
  }

  private now(): Date {
    return this.o.now?.() ?? new Date();
  }

  private tz(): string {
    return this.o.profile.get()?.preferences.owner.timezone ?? TZ_FALLBACK;
  }

  inQuietHours(at = this.now()): boolean {
    const q = this.o.profile.get()?.preferences.notifications.quiet_hours ?? {
      start: "22:00",
      end: "08:00",
    };
    return isWithinWindow(at, q.start, q.end, this.tz());
  }

  private stopping = false;

  setMail(mail: MailActions): void {
    this.mail = mail;
  }

  setPortal(portal: MailActions): void {
    this.portal = portal;
  }

  /** Undo / Apply / Dismiss from an email or portal alert; idempotent through the row's status. */
  async onEmailButton(ctx: Context): Promise<void> {
    const m = CALLBACK.exec(ctx.callbackQuery?.data ?? "");
    const target = m?.[1] === "pa" ? this.portal : this.mail;
    if (!m || !target) {
      await ctx.answerCallbackQuery({ text: "Job Radar is not ready" });
      return;
    }
    const action = m[2] as "undo" | "apply" | "dismiss";
    const rowId = Number(m[3]);
    let result: { ok: boolean; message: string };
    try {
      result = target[action](rowId);
    } catch (err) {
      result = { ok: false, message: errorMessage(err) };
    }
    await ctx.answerCallbackQuery({ text: result.message });
    if (!result.ok) return;
    const text = ctx.callbackQuery?.message?.text ?? "";
    await ctx
      .editMessageText(`${escapeHtml(text)}\n\n<b>${escapeHtml(result.message)}</b>`, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      })
      .catch((err: unknown) => log.warn("telegram edit failed", { error: telegramError(err) }));
  }

  /** Buttons for an email alert, from the email's current status. */
  keyboardFor(n: Notification): InlineKeyboard | undefined {
    const portalId = portalUpdateIdOf(n);
    if (portalId !== null) {
      const row = getPortalApplication(this.o.db, portalId);
      if (!row) return undefined;
      const kb = new InlineKeyboard();
      if (row.status === "auto_applied") kb.text("Undo", `pa:undo:${portalId}`);
      else if (row.status === "suggested") {
        const single = row.applicationId !== null || row.candidates.length === 1;
        if (single && row.pending?.targetStage) kb.text("Apply", `pa:apply:${portalId}`);
        kb.text("Dismiss", `pa:dismiss:${portalId}`);
      } else return undefined;
      return kb;
    }
    const emailId = emailIdOf(n);
    if (emailId === null) return undefined;
    const email = getApplicationEmail(this.o.db, emailId);
    if (!email) return undefined;
    const kb = new InlineKeyboard();
    if (email.status === "auto_applied") kb.text("Undo", `em:undo:${emailId}`);
    else if (email.status === "suggested") {
      const single = email.applicationId !== null || email.candidates.length === 1;
      if (single) kb.text("Apply", `em:apply:${emailId}`);
      kb.text("Dismiss", `em:dismiss:${emailId}`);
    } else return undefined;
    return kb;
  }

  /** Long polling; no webhook, no inbound port. */
  start(): void {
    if (this.polling) return;
    this.stopping = false;
    this.polling = true;
    void this.bot
      .start({ drop_pending_updates: true, onStart: () => log.info("telegram bot polling") })
      .catch((err: unknown) => {
        this.polling = false;
        // Stopping on purpose (Quit, restart) aborts the long poll: not an error.
        if (this.stopping) log.info("telegram polling stopped");
        else log.error("telegram polling stopped", { error: telegramError(err) });
      });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.polling) await this.bot.stop();
    this.polling = false;
  }

  private async send(html: string, keyboard?: InlineKeyboard): Promise<void> {
    await this.bot.api.sendMessage(this.owner, html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
  }

  format(n: Notification): string {
    const lines = [`<b>${escapeHtml(n.title)}</b>`, escapeHtml(n.body)];
    if (n.offerId) {
      const offer = getOffer(this.o.db, n.offerId);
      lines.push(`<a href="${this.o.webBaseUrl}/offers/${n.offerId}">Open in Job Radar</a>`);
      if (offer && emailIdOf(n) === null) {
        lines.push(`<a href="${escapeHtml(offer.sourceUrl)}">Source page</a>`);
      }
    } else if (emailIdOf(n) !== null) {
      lines.push(`<a href="${this.o.webBaseUrl}/pipeline">Open the pipeline</a>`);
    }
    return lines.filter(Boolean).join("\n");
  }

  /** Delivery hook for new notifications. */
  async deliver(n: Notification): Promise<void> {
    if (!TELEGRAM_KINDS.has(n.kind)) {
      setTelegramStatus(this.o.db, [n.id], "skipped");
      return;
    }
    if (this.inQuietHours() && !URGENT_KINDS.has(n.kind)) {
      setTelegramStatus(this.o.db, [n.id], "held");
      return;
    }
    try {
      await this.send(
        n.kind === "digest" ? this.digestHtml() : this.format(n),
        this.keyboardFor(n),
      );
      setTelegramStatus(this.o.db, [n.id], "sent", this.now());
    } catch (err) {
      setTelegramStatus(this.o.db, [n.id], "failed");
      log.error("telegram send failed", {
        id: n.id,
        error: telegramError(err),
      });
    }
  }

  /** After quiet hours: everything held goes out as one digest message. */
  async flushHeld(): Promise<number> {
    if (this.inQuietHours()) return 0;
    const held = notificationsWithTelegramStatus(this.o.db, ["held"]);
    if (!held.length) return 0;
    const lines = [`<b>While you were away (${held.length})</b>`];
    for (const n of held.slice(0, 20)) {
      const link = n.offerId
        ? ` — <a href="${this.o.webBaseUrl}/offers/${n.offerId}">open</a>`
        : "";
      lines.push(`• ${escapeHtml(n.title)}${link}`);
    }
    if (held.length > 20) lines.push(`…and ${held.length - 20} more in the app.`);
    try {
      await this.send(lines.join("\n"));
      setTelegramStatus(
        this.o.db,
        held.map((n) => n.id),
        "sent",
        this.now(),
      );
      return held.length;
    } catch (err) {
      log.error("telegram held digest failed", { error: telegramError(err) });
      return 0;
    }
  }

  private digestHtml(): string {
    return buildDigest(this.o, this.now()).html;
  }

  private async replyDigest(ctx: Context): Promise<void> {
    await ctx.reply(this.digestHtml(), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }

  private statusText(): string {
    const held = notificationsWithTelegramStatus(this.o.db, ["held"]).length;
    return `Job Radar is running. Quiet hours ${this.inQuietHours() ? "active" : "inactive"}; ${held} alert(s) held.`;
  }

  /** Called every minute by the worker. */
  async tick(): Promise<void> {
    await this.flushHeld();
  }
}

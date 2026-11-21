// Replies to applications (application-emails): read every mailbox read-only, prefilter locally,
// classify matches, then update the pipeline automatically (with Undo) or suggest.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LlmCapReachedError,
  LlmUnavailableError,
  appTimeZone,
  classifyReply,
  cleanReplyBody,
  decide,
  isInterviewStage,
  matchReply,
  targetStageFor,
  type ApplicationCandidate,
  type LlmBudget,
  type LlmClient,
  type PolicyDecision,
  type ValidatedReply,
} from "@job-radar/core";
import {
  addTimelineEvent,
  alertAccounts,
  alertReadFolders,
  createMailAccount,
  deleteMailAccount,
  getApplication,
  getApplicationEmail,
  getMailAccount,
  getMailCursor,
  getOffer,
  getSource,
  hasApplicationEmail,
  insertApplicationEmail,
  listMailAccounts,
  listStages,
  openApplications,
  ownAddresses,
  queuedApplicationEmails,
  setMailAccountStatus,
  setMailCursor,
  updateApplicationEmail,
  updateMailAccount,
  updateSource,
  type ApplicationEmail,
  type Db,
  type InterviewInput,
  type MailAccount,
  type MailAccountInput,
  type NotificationKind,
} from "@job-radar/db";
import {
  connectImap,
  describeMailError,
  readFolder,
  testImapFolders,
  type AlertFolderRead,
  type FolderCount,
  type AlertMailbox,
  type ImapAccount,
  type MailConnector,
  type ReadOnlyImap,
} from "@job-radar/sources";
import { errorMessage, log, registerSecret } from "../log";
import { applyPipelineUpdate, undoPipelineUpdate } from "../pipeline-updates";
import type { Notifier } from "../notifier";
import type { ProfileService } from "../profile-service";
import { readSecretFile } from "../secrets";

export const LOOKBACK_DAYS = 60;
export const ACCOUNT_TIMEOUT_MS = 60_000;
/** Job alerts: at most this many new messages per folder per run (job-alert-mailboxes D3). */
export const ALERT_MESSAGES_PER_FOLDER = 200;

export class MailError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface MailServiceOptions {
  db: Db;
  profile: ProfileService;
  notifier?: Notifier | undefined;
  llm: { client: LlmClient; budget: LlmBudget };
  secretsDir: string;
  /** Interview prep for moves into an interview stage (same path as a manual move). */
  onInterviewStage?: (applicationId: number) => void;
  connect?: (account: ImapAccount) => ReadOnlyImap;
  now?: () => Date;
}

export interface AccountView extends MailAccount {
  hasPassword: boolean;
}

export interface CheckSummary {
  accounts: number;
  failed: number;
  scanned: number;
  matched: number;
  classified: number;
  queued: number;
}

export interface ActionResult {
  ok: boolean;
  status: ApplicationEmail["status"];
  message: string;
}

/** What is kept in `application_emails.result`. Dates are ISO strings. */
interface StoredResult {
  reply: Omit<ValidatedReply, "nextStep" | "interview"> & {
    nextStep: { description: string; dueAt: string | null } | null;
    interview: {
      kind: string;
      scheduledAt: string | null;
      timeZone: string | null;
      link: string | null;
    } | null;
  };
  decision: PolicyDecision;
}

function storeReply(reply: ValidatedReply, decision: PolicyDecision): StoredResult {
  return {
    reply: {
      ...reply,
      nextStep: reply.nextStep
        ? {
            description: reply.nextStep.description,
            dueAt: reply.nextStep.dueAt?.toISOString() ?? null,
          }
        : null,
      interview: reply.interview
        ? { ...reply.interview, scheduledAt: reply.interview.scheduledAt?.toISOString() ?? null }
        : null,
    },
    decision,
  };
}

function loadReply(stored: StoredResult): ValidatedReply {
  const r = stored.reply;
  return {
    ...r,
    nextStep: r.nextStep
      ? {
          description: r.nextStep.description,
          dueAt: r.nextStep.dueAt ? new Date(r.nextStep.dueAt) : null,
        }
      : null,
    interview: r.interview
      ? {
          kind: r.interview.kind as NonNullable<ValidatedReply["interview"]>["kind"],
          scheduledAt: r.interview.scheduledAt ? new Date(r.interview.scheduledAt) : null,
          timeZone: r.interview.timeZone,
          link: r.interview.link,
        }
      : null,
  };
}

const INTERVIEW_TYPE: Record<string, InterviewInput["type"]> = {
  screening: "screening",
  technical: "technical",
  fit: "fit",
  final: "final",
  other: "other",
};

const CATEGORY_LABEL: Record<string, string> = {
  rejection: "rejection",
  interview_invitation: "interview invitation",
  take_home: "take-home",
  offer: "offer",
  information_request: "request for information",
  acknowledgement: "acknowledgement",
  other: "email",
};

export class MailService {
  private running: Promise<CheckSummary> | null = null;
  private lastRunAt = 0;

  constructor(private readonly o: MailServiceOptions) {}

  private now(): Date {
    return this.o.now?.() ?? new Date();
  }

  private tz(): string {
    return this.o.profile.get()?.preferences.owner.timezone ?? appTimeZone();
  }

  // ---------- accounts ----------

  private secretDir(): string {
    return join(this.o.secretsDir, "mail");
  }

  private password(id: number): string | null {
    return readSecretFile(this.secretDir(), String(id));
  }

  private savePassword(id: number, password: string): void {
    const value = password.trim();
    if (!value) return;
    registerSecret(value);
    mkdirSync(this.secretDir(), { recursive: true, mode: 0o700 });
    writeFileSync(join(this.secretDir(), String(id)), value, { mode: 0o600 });
  }

  listAccounts(): AccountView[] {
    return listMailAccounts(this.o.db).map((a) => ({
      ...a,
      hasPassword: existsSync(join(this.secretDir(), String(a.id))),
    }));
  }

  private view(a: MailAccount): AccountView {
    return { ...a, hasPassword: existsSync(join(this.secretDir(), String(a.id))) };
  }

  createAccount(input: MailAccountInput, password: string | null): AccountView {
    const a = createMailAccount(this.o.db, input);
    if (password) this.savePassword(a.id, password);
    log.info("mail account added", { id: a.id });
    return this.view(a);
  }

  updateAccount(
    id: number,
    patch: Partial<MailAccountInput>,
    password: string | null,
  ): AccountView {
    if (!getMailAccount(this.o.db, id)) throw new MailError("Account not found", 404);
    const a = updateMailAccount(this.o.db, id, patch, this.now());
    if (password) this.savePassword(id, password);
    return this.view(a);
  }

  /**
   * Moves the old single-mailbox job-alert setup (email_alerts settings plus
   * secrets/imap_app_password) onto the email account with that address, creating it if needed
   * (job-alert-mailboxes D5). Idempotent; the old secret file is left in place.
   */
  migrateAlertMailbox(): { migrated: boolean; accountId?: number; created?: boolean } {
    const source = getSource(this.o.db, "email_alerts");
    const settings = (source?.settings ?? {}) as Record<string, unknown>;
    if (!source || settings["migrated"] === true) return { migrated: false };
    const user = typeof settings["user"] === "string" ? settings["user"].trim() : "";
    const password = readSecretFile(this.o.secretsDir, "imap_app_password");
    if (!user || !password) return { migrated: false };
    registerSecret(password);
    const label =
      typeof settings["label"] === "string" && settings["label"].trim()
        ? settings["label"].trim()
        : "job-alerts";
    const host =
      typeof settings["host"] === "string" && settings["host"].trim()
        ? settings["host"].trim()
        : "imap.gmail.com";
    const port = typeof settings["port"] === "number" ? settings["port"] : 993;
    const existing = listMailAccounts(this.o.db).find(
      (a) => a.address.toLowerCase() === user.toLowerCase(),
    );
    let accountId: number;
    if (existing) {
      updateMailAccount(
        this.o.db,
        existing.id,
        {
          jobAlerts: true,
          alertFolders: existing.alertFolders.includes(label)
            ? existing.alertFolders
            : [...existing.alertFolders, label],
        },
        this.now(),
      );
      // An account added without a password can use the one the old setup had.
      if (!this.password(existing.id)) this.savePassword(existing.id, password);
      accountId = existing.id;
    } else {
      const created = createMailAccount(this.o.db, {
        label: user.split("@")[1] ?? user,
        address: user,
        host,
        port,
        jobAlerts: true,
        alertFolders: [label],
      });
      this.savePassword(created.id, password);
      accountId = created.id;
    }
    updateSource(this.o.db, "email_alerts", { settings: { ...settings, migrated: true } });
    log.info("job-alert mailbox moved to email accounts", { accountId, created: !existing });
    return { migrated: true, accountId, created: !existing };
  }

  deleteAccount(id: number): void {
    deleteMailAccount(this.o.db, id);
    rmSync(join(this.secretDir(), String(id)), { force: true });
    log.info("mail account removed", { id });
  }

  private imapAccount(a: MailAccount): ImapAccount {
    const password = this.password(a.id);
    if (!password) throw new MailError("No app password saved for this account");
    return { host: a.host, port: a.port, user: a.address, password };
  }

  private connect(account: ImapAccount): ReadOnlyImap {
    return (this.o.connect ?? connectImap)(account);
  }

  /** Read-only login and INBOX count; records the account status. */
  async testAccount(id: number): Promise<{
    ok: boolean;
    messages?: number;
    alertFolders?: FolderCount[];
    error?: string;
  }> {
    const a = getMailAccount(this.o.db, id);
    if (!a) throw new MailError("Account not found", 404);
    try {
      // Job alerts on: also count the alert folders (INBOX is already counted).
      const extra = a.jobAlerts ? a.alertFolders.filter((f) => f.toUpperCase() !== "INBOX") : [];
      const r = await withTimeout(
        testImapFolders(this.connect(this.imapAccount(a)), extra),
        ACCOUNT_TIMEOUT_MS,
        `${a.host} did not answer within ${ACCOUNT_TIMEOUT_MS / 1000} s`,
      );
      setMailAccountStatus(this.o.db, id, { ok: true }, this.now());
      return { ok: true, messages: r.inbox, ...(extra.length ? { alertFolders: r.folders } : {}) };
    } catch (err) {
      const error = err instanceof MailError ? err.message : describeMailError(err, a.host);
      setMailAccountStatus(this.o.db, id, { ok: false, error }, this.now());
      return { ok: false, error };
    }
  }

  // ---------- checking ----------

  /** Runs when `mail.check_minutes` have passed since the last check (called every minute). */
  tick(): void {
    const minutes = this.o.profile.get()?.preferences.mail.check_minutes ?? 15;
    if (this.now().getTime() - this.lastRunAt < minutes * 60_000) return;
    void this.check().catch((err: unknown) =>
      log.error("mail check failed", { error: errorMessage(err) }),
    );
  }

  /** Checks every enabled account (or one), then classifies what matched. One run at a time. */
  check(accountId?: number): Promise<CheckSummary> {
    if (this.running) return this.running;
    this.lastRunAt = this.now().getTime();
    this.running = this.runCheck(accountId).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runCheck(accountId?: number): Promise<CheckSummary> {
    const summary: CheckSummary = {
      accounts: 0,
      failed: 0,
      scanned: 0,
      matched: 0,
      classified: 0,
      queued: 0,
    };
    const accounts = listMailAccounts(this.o.db).filter(
      (a) => a.enabled && (accountId === undefined || a.id === accountId),
    );
    for (const a of accounts) {
      summary.accounts++;
      try {
        const r = await withTimeout(
          this.readAccount(a),
          ACCOUNT_TIMEOUT_MS,
          `${a.host} did not answer within ${ACCOUNT_TIMEOUT_MS / 1000} s`,
        );
        summary.scanned += r.scanned;
        summary.matched += r.matched;
        setMailAccountStatus(this.o.db, a.id, { ok: true }, this.now());
      } catch (err) {
        summary.failed++;
        const error = err instanceof MailError ? err.message : describeMailError(err, a.host);
        setMailAccountStatus(this.o.db, a.id, { ok: false, error }, this.now());
        log.warn("mail account check failed", { id: a.id });
      }
    }
    const processed = await this.processQueue();
    summary.classified = processed.classified;
    summary.queued = processed.queued;
    log.info("mail check", { ...summary });
    return summary;
  }

  /**
   * Read-only access to the accounts with job alerts on, for the job-alert source
   * (job-alert-mailboxes D3). Alert cursors are kept apart from the reply cursors.
   */
  alertConnector(): MailConnector {
    return {
      accounts: () =>
        alertAccounts(this.o.db).map((a): AlertMailbox => {
          const inboxIsAlertFolder = a.alertFolders.some((f) => f.toUpperCase() === "INBOX");
          return {
            id: a.id,
            label: a.label,
            folders: alertReadFolders(a).map((name) => ({
              name,
              knownSendersOnly: name.toUpperCase() === "INBOX" && !inboxIsAlertFolder,
            })),
          };
        }),
      read: (mailbox, folders, since) => {
        const a = getMailAccount(this.o.db, mailbox.id);
        if (!a) return Promise.reject(new MailError("Account not found", 404));
        return withTimeout(
          this.readAlerts(a, folders, since),
          ACCOUNT_TIMEOUT_MS * 2,
          `${a.host} did not answer within ${(ACCOUNT_TIMEOUT_MS * 2) / 1000} s`,
        );
      },
    };
  }

  private async readAlerts(
    a: MailAccount,
    folders: Parameters<MailConnector["read"]>[1],
    since: Date,
  ): Promise<AlertFolderRead[]> {
    const client = this.connect(this.imapAccount(a));
    try {
      await client.connect();
    } catch (err) {
      client.close();
      throw new MailError(describeMailError(err, a.host));
    }
    const out: AlertFolderRead[] = [];
    try {
      for (const req of folders) {
        try {
          const result = await readFolder(
            client,
            req.folder,
            getMailCursor(this.o.db, a.id, req.folder, "alerts"),
            since,
            (e) =>
              req.accept({ fromAddress: e.fromAddress, fromName: e.fromName, subject: e.subject }),
            { limit: ALERT_MESSAGES_PER_FOLDER },
          );
          out.push({
            folder: req.folder,
            emails: result.matched.map((m) => ({
              messageId:
                m.messageId ?? `no-id:${a.id}:${req.folder}:${result.cursor.uidValidity}:${m.uid}`,
              from: m.from,
              subject: m.subject,
              date: m.sentAt ?? m.receivedAt,
              html: m.html,
              text: m.text || null,
            })),
          });
          setMailCursor(this.o.db, a.id, req.folder, result.cursor, this.now(), "alerts");
        } catch (err) {
          out.push({
            folder: req.folder,
            emails: [],
            error: describeMailError(err, a.host, req.folder),
          });
        }
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
    return out;
  }

  private async readAccount(a: MailAccount): Promise<{ scanned: number; matched: number }> {
    const client = this.connect(this.imapAccount(a));
    const candidates: ApplicationCandidate[] = openApplications(this.o.db);
    const own = ownAddresses(this.o.db);
    const now = this.now();
    const oldest = candidates.reduce(
      (min, c) => Math.min(min, c.appliedAt.getTime()),
      now.getTime(),
    );
    const since = new Date(Math.max(oldest, now.getTime() - LOOKBACK_DAYS * 86_400_000));
    let scanned = 0;
    let matched = 0;
    await client.connect();
    try {
      for (const folder of a.folders) {
        const matches = new Map<number, number[]>();
        const result = await readFolder(
          client,
          folder,
          getMailCursor(this.o.db, a.id, folder),
          since,
          (e) => {
            if (e.messageId && hasApplicationEmail(this.o.db, e.messageId)) return false;
            const m = matchReply(e, candidates, own);
            if (m)
              matches.set(
                e.uid,
                m.candidates.map((c) => c.applicationId),
              );
            return Boolean(m);
          },
        );
        scanned += result.scanned;
        for (const reply of result.matched) {
          const body = cleanReplyBody(reply.text);
          const stored = insertApplicationEmail(this.o.db, {
            accountId: a.id,
            messageId:
              reply.messageId ??
              `no-id:${a.id}:${folder}:${result.cursor.uidValidity}:${reply.uid}`,
            folder,
            uid: reply.uid,
            receivedAt: reply.receivedAt,
            fromName: reply.fromName,
            fromAddress: reply.fromAddress,
            subject: reply.subject,
            excerpt: body.slice(0, 500),
            candidates: matches.get(reply.uid) ?? [],
            status: "queued",
            pendingBody: body,
          });
          if (stored) matched++;
        }
        // Advance only after the matches are stored: a crash re-reads instead of skipping.
        setMailCursor(this.o.db, a.id, folder, result.cursor, this.now());
      }
    } catch (err) {
      throw err instanceof MailError
        ? err
        : new MailError(describeMailError(err, a.host, a.folders.join(", ")));
    } finally {
      await client.logout().catch(() => client.close());
    }
    return { scanned, matched };
  }

  /** Classifies queued emails in arrival order until the cap is reached. */
  async processQueue(): Promise<{ classified: number; queued: number }> {
    let classified = 0;
    const queue = queuedApplicationEmails(this.o.db);
    for (const email of queue) {
      try {
        await this.classify(email);
        classified++;
      } catch (err) {
        if (err instanceof LlmCapReachedError || err instanceof LlmUnavailableError) break;
        log.warn("email classification failed", { id: email.id, error: errorMessage(err) });
        updateApplicationEmail(this.o.db, email.id, {
          status: "suggested",
          summary: "Could not be classified automatically.",
          pendingBody: null,
          result: storeReply(
            {
              applicationId: null,
              category: "other",
              confidence: "low",
              summary: "Could not be classified automatically.",
              nextStep: null,
              interview: null,
              issues: ["classification failed"],
            },
            { action: "suggest", targetStage: null, reasons: ["classification failed"] },
          ) as unknown as Record<string, unknown>,
        });
        classified++;
      }
    }
    return { classified, queued: queue.length - classified };
  }

  private candidatesFor(email: ApplicationEmail): ApplicationCandidate[] {
    const open = openApplications(this.o.db);
    return email.candidates.flatMap((id) => open.find((c) => c.applicationId === id) ?? []);
  }

  private async classify(email: ApplicationEmail): Promise<void> {
    const candidates = this.candidatesFor(email);
    const model = this.o.profile.get()?.preferences.scoring.models.scoring ?? "haiku";
    const { reply } = await classifyReply(
      this.o.llm,
      {
        fromName: email.fromName,
        fromAddress: email.fromAddress,
        subject: email.subject,
        receivedAt: email.receivedAt,
        body: email.pendingBody ?? email.excerpt,
      },
      candidates,
      { model, ownerTimeZone: this.tz(), now: this.now() },
    );
    const app = reply.applicationId ? getApplication(this.o.db, reply.applicationId) : undefined;
    const custom = app
      ? Boolean(listStages(this.o.db).find((s) => s.key === app.stage)?.custom)
      : false;
    const decision = decide(reply, app ? { stage: app.stage, customStage: custom } : null);
    const base = {
      applicationId: reply.applicationId,
      category: reply.category,
      confidence: reply.confidence,
      summary: reply.summary,
      pendingBody: null,
      result: storeReply(reply, decision) as unknown as Record<string, unknown>,
    };
    if (decision.action === "auto" && app) {
      updateApplicationEmail(this.o.db, email.id, base, this.now());
      this.applyUpdate(email.id, app.id, reply, decision.targetStage, "auto_applied");
      return;
    }
    if (decision.action === "timeline_only") {
      const row = updateApplicationEmail(
        this.o.db,
        email.id,
        { ...base, status: "timeline_only" },
        this.now(),
      );
      if (app) this.emailTimeline(row, app.id, app.offerId, "");
      return;
    }
    const row = updateApplicationEmail(
      this.o.db,
      email.id,
      { ...base, status: "suggested" },
      this.now(),
    );
    if (app) this.emailTimeline(row, app.id, app.offerId, " (suggestion)");
    this.notifyEmail(row, reply, null, true);
  }

  private emailTimeline(
    row: ApplicationEmail,
    applicationId: number,
    offerId: number,
    suffix: string,
  ) {
    addTimelineEvent(this.o.db, {
      offerId,
      applicationId,
      kind: "email",
      message: `Email from ${row.fromName ?? row.fromAddress}: ${row.summary ?? row.subject}${suffix}`,
      data: { emailId: row.id, status: row.status },
      at: row.receivedAt,
    });
  }

  /** Writes stage, next step and interview for an email, keeping what Undo needs. */
  private applyUpdate(
    emailId: number,
    applicationId: number,
    reply: ValidatedReply,
    targetStage: string | null,
    status: "auto_applied" | "applied",
  ): void {
    const db = this.o.db;
    const at = this.now();
    const app = getApplication(db, applicationId);
    if (!app) throw new MailError("Application not found", 404);
    const email = getApplicationEmail(db, emailId);
    if (!email) throw new MailError("Email not found", 404);
    updateApplicationEmail(db, emailId, { applicationId, status }, at);
    this.emailTimeline({ ...email, status }, applicationId, app.offerId, "");
    const iv = reply.interview;
    const undo = applyPipelineUpdate(
      db,
      {
        applicationId,
        targetStage,
        note: "From email",
        nextStep: reply.nextStep,
        interview:
          iv?.scheduledAt && iv.timeZone
            ? {
                type: INTERVIEW_TYPE[iv.kind] ?? "other",
                scheduledAt: iv.scheduledAt,
                timeZone: iv.timeZone,
                link: iv.link,
                prepNotes: `From email: ${email.subject}`,
              }
            : undefined,
        at,
      },
      { source: "email", emailId },
    );
    const row = updateApplicationEmail(db, emailId, { undo }, at);
    if (undo.targetStage && isInterviewStage(undo.targetStage))
      this.o.onInterviewStage?.(applicationId);
    this.notifyEmail(row, reply, undo.targetStage, false);
  }

  private notifyEmail(
    row: ApplicationEmail,
    reply: ValidatedReply,
    movedTo: string | null,
    suggestion: boolean,
  ): void {
    const kind: NotificationKind | null =
      reply.category === "rejection"
        ? "email_rejection"
        : reply.category === "offer"
          ? "email_offer"
          : reply.nextStep ||
              reply.interview ||
              ["interview_invitation", "take_home", "information_request"].includes(reply.category)
            ? "email_next_step"
            : null;
    if (!kind || !this.o.notifier) return;
    const app = row.applicationId ? getApplication(this.o.db, row.applicationId) : undefined;
    const offer = app ? getOffer(this.o.db, app.offerId) : undefined;
    const who = offer ? `${offer.companyName} (${offer.title})` : (row.fromName ?? row.fromAddress);
    const stageLabel = (key: string) =>
      listStages(this.o.db).find((s) => s.key === key)?.label ?? key;
    const lines = [reply.summary];
    if (movedTo) lines.push(`Moved to ${stageLabel(movedTo)}.`);
    else if (suggestion) {
      const reasons = (row.result as unknown as StoredResult | null)?.decision.reasons ?? [];
      lines.push(`Suggested, not applied${reasons.length ? `: ${reasons.join("; ")}` : ""}.`);
    }
    if (reply.interview?.scheduledAt && reply.interview.timeZone) {
      lines.push(`Interview: ${formatWhen(reply.interview.scheduledAt, reply.interview.timeZone)}`);
    }
    if (reply.nextStep) {
      lines.push(
        `Next step: ${reply.nextStep.description}${reply.nextStep.dueAt ? ` (by ${formatWhen(reply.nextStep.dueAt, this.tz())})` : ""}`,
      );
    }
    this.o.notifier.notify({
      kind,
      title: `${suggestion ? "Suggested: " : ""}${CATEGORY_LABEL[reply.category] ?? "email"} from ${who}`,
      body: lines.join("\n"),
      offerId: offer?.id ?? null,
      applicationId: app?.id ?? null,
      dedupeKey: `email:${row.id}:${kind}`,
    });
  }

  // ---------- owner actions ----------

  undo(emailId: number): ActionResult {
    const db = this.o.db;
    const email = getApplicationEmail(db, emailId);
    if (!email) throw new MailError("Email not found", 404);
    if (email.status === "undone")
      return { ok: false, status: email.status, message: "Already undone" };
    if (
      (email.status !== "auto_applied" && email.status !== "applied") ||
      !email.undo ||
      !email.applicationId
    ) {
      return { ok: false, status: email.status, message: "Nothing to undo" };
    }
    const u = email.undo;
    const appId = email.applicationId;
    const app = getApplication(db, appId);
    if (!app) throw new MailError("Application not found", 404);
    const at = this.now();
    const left = undoPipelineUpdate(
      db,
      appId,
      u,
      { source: "email", emailId },
      { note: "Undo email update", changedAfter: "the email", at },
    );
    updateApplicationEmail(db, emailId, { status: "undone" }, at);
    const message = left.length ? `Undone, except ${left.join(" and ")}` : "Undone";
    addTimelineEvent(db, {
      offerId: app.offerId,
      applicationId: appId,
      kind: "email_undone",
      message: `Undid the update from the email "${email.subject}"${left.length ? `; kept ${left.join(" and ")}` : ""}`,
      data: { emailId },
      at,
    });
    return { ok: true, status: "undone", message };
  }

  apply(emailId: number, applicationId?: number): ActionResult {
    const db = this.o.db;
    const email = getApplicationEmail(db, emailId);
    if (!email) throw new MailError("Email not found", 404);
    if (email.status !== "suggested") {
      return {
        ok: false,
        status: email.status,
        message: email.status === "applied" ? "Already applied" : "This email is not a suggestion",
      };
    }
    const chosen =
      applicationId ??
      email.applicationId ??
      (email.candidates.length === 1 ? email.candidates[0] : undefined);
    if (!chosen) throw new MailError("Pick the application this email is about");
    if (
      applicationId !== undefined &&
      !email.candidates.includes(applicationId) &&
      email.applicationId !== applicationId
    ) {
      throw new MailError("That application was not a candidate for this email");
    }
    const app = getApplication(db, chosen);
    if (!app) throw new MailError("Application not found", 404);
    const stored = email.result as unknown as StoredResult | null;
    const reply = stored ? loadReply(stored) : null;
    if (!reply) throw new MailError("This email has no result to apply");
    const target = targetStageFor(reply, app.stage);
    const targetStage = target === "unknown" || target === null ? null : target;
    this.applyUpdate(emailId, chosen, { ...reply, applicationId: chosen }, targetStage, "applied");
    return { ok: true, status: "applied", message: "Applied" };
  }

  dismiss(emailId: number): ActionResult {
    const email = getApplicationEmail(this.o.db, emailId);
    if (!email) throw new MailError("Email not found", 404);
    if (email.status === "dismissed")
      return { ok: false, status: email.status, message: "Already dismissed" };
    if (email.status !== "suggested") {
      return { ok: false, status: email.status, message: "This email is not a suggestion" };
    }
    updateApplicationEmail(this.o.db, emailId, { status: "dismissed" }, this.now());
    return { ok: true, status: "dismissed", message: "Dismissed" };
  }

  /** Lets tests wait for a run started by tick(). */
  async idle(): Promise<void> {
    await this.running?.catch(() => {});
  }
}

function formatWhen(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(at);
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MailError(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

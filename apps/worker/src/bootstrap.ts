import {
  appTimeZone,
  LlmBudget,
  createClaudeCodeClient,
  createResearchClient,
  isEmptyProfile,
  type CompanyProfile,
  type LlmClient,
  type ResearchClient,
} from "@job-radar/core";
import {
  failStaleRuns,
  llmUsageStore,
  resetInterruptedScoring,
  resetInterruptedResearch,
  openOfferIdsForCompany,
  openDatabase,
  runDailyBackupIfDue,
  setTelegramStatus,
  type Db,
} from "@job-radar/db";
import {
  BrowserSessions,
  adapters,
  chooseBrowser,
  defaultProfileDir,
  type PageReader,
} from "@job-radar/sources";
import cron from "node-cron";
import { config } from "./config";
import type { WorkerContext } from "./context";
import { Scheduler } from "./ingest/scheduler";
import { syncSources } from "./ingest/sources-sync";
import { errorMessage, log } from "./log";
import { DraftService } from "./drafts/service";
import { Notifier } from "./notifier";
import { strongMatchNotification } from "./notifications/messages";
import { createDigestIfDue } from "./notifications/digest";
import { TelegramService } from "./notifications/telegram";
import { ProfileService } from "./profile-service";
import { ScoringService } from "./scoring/service";
import { sendFollowUpReminders, sendInterviewReminders, suggestNoResponse } from "./pipeline/jobs";
import { PrepService } from "./pipeline/prep";
import { LearningService } from "./learning/service";
import { ResearchService } from "./research/service";
import { ensureManualSource } from "./ingest/import";
import { readSecretFile } from "./secrets";

export interface Worker extends Required<
  Pick<
    WorkerContext,
    "notifier" | "scheduler" | "scoring" | "drafts" | "prep" | "learning" | "research" | "llm"
  >
> {
  db: Db;
  profile: ProfileService;
  telegram: TelegramService | null;
  browser: BrowserSessions;
  start(): void;
  stop(): void;
}

/** Builds every worker service. `start()` begins schedules; tests can skip it. */
export function createWorker(
  options: {
    db?: Db;
    llmClient?: LlmClient;
    researchClient?: ResearchClient;
    newPageReader?: () => PageReader;
  } = {},
): Worker {
  const db = options.db ?? openDatabase();
  const profile = new ProfileService(db, config.profileDir, config.seedDir);
  profile.reload();
  const notifier = new Notifier(db);
  const telegramToken = readSecretFile(config.secretsDir, "telegram_bot_token");
  const telegramChat = readSecretFile(config.secretsDir, "telegram_chat_id");
  const telegram =
    telegramToken && telegramChat
      ? new TelegramService({
          token: telegramToken,
          ownerChatId: telegramChat,
          db,
          profile,
          webBaseUrl: config.webBaseUrl,
        })
      : null;
  notifier.onCreated((n) =>
    telegram ? telegram.deliver(n) : setTelegramStatus(db, [n.id], "skipped"),
  );

  const oauthToken = readSecretFile(config.secretsDir, "claude_oauth_token") ?? undefined;
  const client =
    options.llmClient ??
    createClaudeCodeClient({ oauthToken, executable: config.claudeExecutable });
  const caps = () => {
    const c = profile.get()?.preferences.scoring.daily_caps;
    return { scoring: c?.scoring ?? 300, drafts: c?.drafts ?? 30, research: c?.research ?? 10 };
  };
  const budget = new LlmBudget(llmUsageStore(db), caps, (e) => {
    notifier.notify({
      kind: "llm_cap_reached",
      title: `Daily ${e.group === "drafts" ? "draft" : e.group} cap reached`,
      body:
        e.group === "research"
          ? `${e.cap} company researches used today. Triggered research waits until midnight (${appTimeZone()}).`
          : `${e.cap} ${e.group === "drafts" ? "drafts" : "scoring calls"} used today. Remaining offers wait as "awaiting score" until midnight (${appTimeZone()}).`,
      dedupeKey: `llm_cap_reached:${e.group}:${e.day}`,
    });
  });
  const scoring = new ScoringService({ db, profile, client, budget, notifier });
  const drafts = new DraftService({ db, profile, client, budget });

  const learning = new LearningService({ db, profile, client, budget, notifier });
  const research = new ResearchService({
    db,
    profile,
    research:
      options.researchClient ??
      createResearchClient({ oauthToken, executable: config.claudeExecutable }),
    client,
    budget,
    ...(options.newPageReader ? { newReader: options.newPageReader } : {}),
  });
  const prep = new PrepService({ db, profile, client, budget, notifier, research });
  // After research, the company's open offers are rescored with the profile (design D6).
  // A profile without any sourced fact changes nothing, so it does not spend scoring calls.
  research.onFinished((row) => {
    const p = row.profile as unknown as CompanyProfile | null;
    if (p && !isEmptyProfile(p)) scoring.enqueue(openOfferIdsForCompany(db, row.companyId));
  });
  scoring.onScored((offer, score) => {
    if (score.scoreClass !== "strong") return;
    if (offer.companyId && profile.get()?.preferences.research.auto_strong) {
      try {
        research.request(offer.companyId, { offerId: offer.id, reason: "strong" });
      } catch (err) {
        log.warn("research request failed", { offerId: offer.id, error: errorMessage(err) });
      }
    }
    notifier.notify(strongMatchNotification(offer, score));
    void drafts.autoDraft(offer.id);
  });
  const browser = new BrowserSessions({
    profileDir: defaultProfileDir(config.dataDir),
    viewer: process.env["JOB_RADAR_LOGIN_VIEWER"] === "novnc" ? "novnc" : "window",
    // Google Chrome on macOS when installed (Google sign-in works there); Chromium otherwise.
    browser: chooseBrowser(process.env["JOB_RADAR_BROWSER"]),
    log: (msg, data) => log.info(msg, data),
  });
  const scheduler = new Scheduler({
    db,
    profile,
    notifier,
    dataDir: config.dataDir,
    secretsDir: config.secretsDir,
    adapters,
    llm: { client, budget },
    browser,
    onNewOffers: (ids) => scoring.enqueue(ids),
  });

  const tasks: { stop: () => void }[] = [];
  return {
    db,
    profile,
    notifier,
    scheduler,
    scoring,
    drafts,
    prep,
    learning,
    research,
    llm: { client, budget },
    telegram,
    browser,
    start() {
      const closed = failStaleRuns(db);
      if (closed) log.warn("closed runs interrupted by a restart", { count: closed });
      const requeued = resetInterruptedScoring(db);
      if (requeued) log.warn("re-queued offers interrupted while scoring", { count: requeued });
      syncSources(db, adapters, profile.get()?.preferences ?? null);
      ensureManualSource(db);
      scheduler.start();
      telegram?.start();
      if (!telegram) log.info("telegram not configured; notifications stay in the app");
      scoring.sweep();
      const researchRequeued = resetInterruptedResearch(db);
      if (researchRequeued) log.warn("re-queued interrupted research", { count: researchRequeued });
      research.sweep();
      tasks.push(
        cron.schedule("*/10 * * * *", () => research.sweep(), { name: "research-sweep" }),
        cron.schedule("*/10 * * * *", () => scoring.sweep(), { name: "scoring-sweep" }),
        cron.schedule(
          "* * * * *",
          () => {
            createDigestIfDue({ db, profile, notifier, webBaseUrl: config.webBaseUrl }, new Date());
            void telegram?.tick();
          },
          { name: "notifications" },
        ),
        cron.schedule("*/5 * * * *", () => void sendInterviewReminders(db, notifier), {
          name: "interview-reminders",
        }),
        cron.schedule("7 * * * *", () => void suggestNoResponse(db, notifier), {
          name: "no-response",
        }),
        cron.schedule(
          "37 * * * *",
          () => {
            const days = profile.get()?.preferences.notifications.follow_up_days ?? [];
            sendFollowUpReminders(db, notifier, days);
          },
          { name: "follow-up-reminders" },
        ),
        cron.schedule("20 4 * * *", () => void learning.daily(), {
          name: "learning-daily",
          timezone: appTimeZone(),
        }),
        cron.schedule(
          "17 * * * *",
          () => {
            runDailyBackupIfDue(db)
              .then((file) => file && log.info("daily backup written", { file }))
              .catch((err: unknown) => log.error("backup failed", { error: errorMessage(err) }));
          },
          { name: "daily-backup" },
        ),
      );
      void runDailyBackupIfDue(db).catch(() => {});
    },
    stop() {
      scheduler.stop();
      void telegram?.stop();
      for (const t of tasks) void t.stop();
    },
  };
}

import type { LlmBudget, LlmClient } from "@job-radar/core";
import type { Db } from "@job-radar/db";
import type { DraftService } from "./drafts/service";
import type { Scheduler } from "./ingest/scheduler";
import type { Notifier } from "./notifier";
import type { PrepService } from "./pipeline/prep";
import type { LearningService } from "./learning/service";
import type { MailService } from "./mail/service";
import type { ResearchService } from "./research/service";
import type { ProfileService } from "./profile-service";
import type { ScoringService } from "./scoring/service";
import type { TelegramService } from "./notifications/telegram";
import type { BrowserSessions } from "@job-radar/sources";

/** Everything route handlers need; optional services are absent in narrow tests. */
export interface WorkerContext {
  db: Db;
  profile: ProfileService;
  notifier?: Notifier;
  scheduler?: Scheduler;
  scoring?: ScoringService;
  drafts?: DraftService;
  prep?: PrepService;
  learning?: LearningService;
  mail?: MailService;
  research?: ResearchService;
  telegram?: TelegramService | null;
  browser?: BrowserSessions;
  llm?: { client: LlmClient; budget: LlmBudget };
}

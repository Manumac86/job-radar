// Drizzle schema (design D9). Timestamps are UTC epoch milliseconds; money is integer
// minor units plus an ISO currency code; interviews also keep an explicit IANA time zone.
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---------- enums ----------

export const SOURCE_TYPES = [
  "greenhouse",
  "lever",
  "ashby",
  "ycombinator",
  "hn_hiring",
  "remoteok",
  "weworkremotely",
  /** Darwin Recruitment public job feed (WordPress Job Manager RSS). */
  "darwin",
  "email_alerts",
  "malt",
  "wellfound",
  "mercor",
  "upwork",
  "linkedin",
  /** SimpleApply: CSV import and the logged-in dashboard reader (simpleapply-source). */
  "simpleapply",
  "mygreenhouse",
  /** Offers the owner added from a link (Offers → Add from link); never polled. */
  "manual",
  "fake",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = [
  "ok",
  "failing",
  "stopped",
  "session_expired",
  "logged_out",
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const RUN_STATUSES = ["running", "ok", "failed", "partial"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["schedule", "manual"] as const;

export const TRIAGE_STATES = ["new", "shortlisted", "dismissed", "filtered", "archived"] as const;
export type TriageState = (typeof TRIAGE_STATES)[number];

export const SCORE_STATUSES = [
  "awaiting_score",
  "scoring",
  "scored",
  "scoring_failed",
  "not_scored",
] as const;
export type ScoreStatus = (typeof SCORE_STATUSES)[number];

export const SCORE_CLASSES = ["strong", "possible", "weak"] as const;
export type ScoreClass = (typeof SCORE_CLASSES)[number];

export const ENGAGEMENT_TYPES = [
  "contract",
  "part-time",
  "full-time",
  "freelance",
  "unknown",
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const REMOTE_POLICIES = ["remote", "hybrid", "onsite", "unknown"] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];

export const COMP_PERIODS = ["hour", "day", "week", "month", "year", "project"] as const;
export type CompPeriod = (typeof COMP_PERIODS)[number];

/** Built-in application stages, in board order. Custom stages live in `custom_stages`. */
export const APPLICATION_STAGES = [
  "applied",
  "screening_call",
  "technical_interview",
  "take_home",
  "fit_interview",
  "final_interview",
  "offer_received",
  "accepted",
  "rejected",
  "declined",
  "withdrawn",
  "no_response",
] as const;
export type BuiltinStage = (typeof APPLICATION_STAGES)[number];
export const CLOSING_STAGES: readonly BuiltinStage[] = [
  "rejected",
  "declined",
  "withdrawn",
  "no_response",
];

export const INTERVIEW_TYPES = [
  "screening",
  "technical",
  "take_home_review",
  "fit",
  "final",
  "other",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const NOTIFICATION_KINDS = [
  "strong_match",
  "interview_reminder",
  "session_expired",
  "source_stopped",
  "llm_cap_reached",
  "no_response",
  "follow_up",
  "interview_prep",
  "learned_preferences",
  "digest",
  "llm_unavailable",
  "email_next_step",
  "email_offer",
  "email_rejection",
  "portal_next_step",
  "portal_offer",
  "portal_rejection",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const TRANSITION_SOURCES = ["manual", "email", "greenhouse"] as const;
export type TransitionSource = (typeof TRANSITION_SOURCES)[number];

export const EMAIL_CATEGORIES = [
  "rejection",
  "interview_invitation",
  "take_home",
  "offer",
  "information_request",
  "acknowledgement",
  "other",
] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export const EMAIL_CONFIDENCES = ["high", "medium", "low"] as const;
export type EmailConfidence = (typeof EMAIL_CONFIDENCES)[number];
export const EMAIL_STATUSES = [
  "queued",
  "auto_applied",
  "suggested",
  "applied",
  "dismissed",
  "undone",
  "timeline_only",
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
/** Portal status updates (mygreenhouse-source D4): the same lifecycle as email updates. */
export const PORTAL_UPDATE_STATUSES = [
  "auto_applied",
  "suggested",
  "applied",
  "dismissed",
  "undone",
  "timeline_only",
] as const;
export type PortalUpdateStatus = (typeof PORTAL_UPDATE_STATUSES)[number];
export const PORTAL_CATEGORIES = [
  "acknowledgement",
  "in_review",
  "interview",
  "offer",
  "rejection",
  "closed",
  "unknown",
] as const;
export type PortalCategory = (typeof PORTAL_CATEGORIES)[number];
export const MAIL_ACCOUNT_STATUSES = ["new", "ok", "failed"] as const;

export const TELEGRAM_STATUSES = ["pending", "held", "sent", "skipped", "failed"] as const;
export type TelegramStatus = (typeof TELEGRAM_STATUSES)[number];

export const FEEDBACK_KINDS = ["dismissed", "shortlisted", "applied"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const PREFERENCE_POLARITIES = ["avoid", "prefer"] as const;
export type PreferencePolarity = (typeof PREFERENCE_POLARITIES)[number];
/** "deleted" is a tombstone: hidden, but the learning job is told not to re-create it. */
export const LEARNED_STATUSES = ["active", "disabled", "deleted"] as const;
export type LearnedStatus = (typeof LEARNED_STATUSES)[number];
export const LEARNED_ORIGINS = ["learned", "owner"] as const;
export type LearnedOrigin = (typeof LEARNED_ORIGINS)[number];

export const SUGGESTION_KINDS = ["raise_min_hourly", "raise_min_daily"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
export const SUGGESTION_STATUSES = ["pending", "accepted", "rejected"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const RESEARCH_STATUSES = ["queued", "running", "done", "partial", "failed"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];
export const RESEARCH_REASONS = ["manual", "shortlist", "strong", "prep"] as const;
export type ResearchReason = (typeof RESEARCH_REASONS)[number];

export const LLM_KINDS = ["scoring", "drafting", "extraction", "research"] as const;
export type LlmKind = (typeof LLM_KINDS)[number];

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now);

// ---------- tables ----------

export const profilesMeta = sqliteTable("profiles_meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loadedAt: integer("loaded_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: ["ok", "invalid", "missing"] }).notNull(),
  cvHash: text("cv_hash"),
  preferencesHash: text("preferences_hash"),
  errors: text("errors", { mode: "json" }).$type<string[]>().notNull().default([]),
});

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  type: text("type", { enum: SOURCE_TYPES }).notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  intervalMinutes: integer("interval_minutes").notNull().default(360),
  settings: text("settings", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  status: text("status", { enum: SOURCE_STATUSES }).notNull().default("ok"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  stoppedUntil: integer("stopped_until", { mode: "timestamp_ms" }),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  requiresLogin: integer("requires_login", { mode: "boolean" }).notNull().default(false),
  riskAcknowledgedAt: integer("risk_acknowledged_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: RUN_TRIGGERS }).notNull(),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("running"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(now),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    found: integer("found").notNull().default(0),
    newCount: integer("new_count").notNull().default(0),
    filtered: integer("filtered").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    error: text("error"),
    log: text("log", { mode: "json" }).$type<string[]>().notNull().default([]),
  },
  (t) => [index("runs_source_started_idx").on(t.sourceId, t.startedAt)],
);

export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    website: text("website"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("companies_normalized_name_uq").on(t.normalizedName)],
);

export const offers = sqliteTable(
  "offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    companyId: integer("company_id").references(() => companies.id),
    companyName: text("company_name").notNull(),
    companyWebsite: text("company_website"),
    location: text("location"),
    remotePolicy: text("remote_policy", { enum: REMOTE_POLICIES }).notNull().default("unknown"),
    regions: text("regions", { mode: "json" }).$type<string[]>().notNull().default([]),
    engagementType: text("engagement_type", { enum: ENGAGEMENT_TYPES })
      .notNull()
      .default("unknown"),
    compMin: integer("comp_min"),
    compMax: integer("comp_max"),
    compCurrency: text("comp_currency"),
    compPeriod: text("comp_period", { enum: COMP_PERIODS }),
    rateUnknown: integer("rate_unknown", { mode: "boolean" }).notNull().default(true),
    equityMin: real("equity_min"),
    equityMax: real("equity_max"),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    description: text("description").notNull().default(""),
    skills: text("skills", { mode: "json" }).$type<string[]>().notNull().default([]),
    applyMethod: text("apply_method"),
    applyUrl: text("apply_url"),
    companyMeta: text("company_meta", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    raw: text("raw", { mode: "json" }).$type<unknown>(),
    triage: text("triage", { enum: TRIAGE_STATES }).notNull().default("new"),
    triageReason: text("triage_reason"),
    scoreStatus: text("score_status", { enum: SCORE_STATUSES }).notNull().default("awaiting_score"),
    scoreError: text("score_error"),
    score: integer("score"),
    scoreClass: text("score_class", { enum: SCORE_CLASSES }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("offers_source_external_uq").on(t.sourceId, t.externalId),
    index("offers_dedupe_idx").on(t.companyId, t.normalizedTitle),
    index("offers_score_idx").on(t.score),
    index("offers_triage_idx").on(t.triage),
    index("offers_score_status_idx").on(t.scoreStatus),
  ],
);

export const offerLinks = sqliteTable(
  "offer_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    seenAt: integer("seen_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("offer_links_source_external_uq").on(t.sourceId, t.externalId)],
);

export const scores = sqliteTable(
  "scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    overall: integer("overall").notNull(),
    modelOverall: integer("model_overall").notNull(),
    // location-preferred-regions D3: points added for a preferred region, and which one.
    regionBonus: integer("region_bonus").notNull().default(0),
    preferredRegion: text("preferred_region"),
    skillsFit: integer("skills_fit").notNull(),
    seniorityFit: integer("seniority_fit").notNull(),
    rateFit: integer("rate_fit").notNull(),
    locationFit: integer("location_fit").notNull(),
    engagementFit: integer("engagement_fit").notNull(),
    scoreClass: text("score_class", { enum: SCORE_CLASSES }).notNull(),
    rationale: text("rationale").notNull(),
    redFlags: text("red_flags", { mode: "json" }).$type<string[]>().notNull().default([]),
    serviceLines: text("service_lines", { mode: "json" }).$type<string[]>().notNull().default([]),
    isLeadership: integer("is_leadership", { mode: "boolean" }).notNull().default(false),
    /** CV variant recommended for this offer (cv-variants D2); null without variants. */
    recommendedCv: text("recommended_cv"),
    cvReason: text("cv_reason"),
    /** Offer requirements the master CV supports but the recommended variant does not show. */
    cvGaps: text("cv_gaps", { mode: "json" }).$type<string[]>(),
    /** Hash of the variants this score saw, to offer a refresh after they change. */
    cvVariantsHash: text("cv_variants_hash"),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("scores_offer_idx").on(t.offerId, t.createdAt)],
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    message: text("message").notNull(),
    screeningAnswers: text("screening_answers", { mode: "json" })
      .$type<{ question: string; answer: string }[]>()
      .notNull()
      .default([]),
    suggestedRate: text("suggested_rate", { mode: "json" }).$type<{
      amount: number;
      currency: string;
      period: string;
      reasoning: string;
    } | null>(),
    verifyBeforeSending: text("verify_before_sending", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    /** Company profile facts the draft mentions, each with its source (company-research). */
    companyFactsUsed: text("company_facts_used", { mode: "json" })
      .$type<{ fact: string; source: string }[]>()
      .notNull()
      .default([]),
    instruction: text("instruction"),
    /** CV variant the draft was written for (cv-variants D4), with its name at the time. */
    cvVariant: text("cv_variant"),
    cvVariantName: text("cv_variant_name"),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("drafts_offer_version_uq").on(t.offerId, t.version)],
);

export const customStages = sqliteTable("custom_stages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  isClosing: integer("is_closing", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const applications = sqliteTable(
  "applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    /** A built-in stage or the key of a custom stage. */
    stage: text("stage").notNull().default("applied"),
    sentDraftId: integer("sent_draft_id").references(() => drafts.id),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull().default(now),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }).notNull().default(now),
    firstResponseAt: integer("first_response_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    noResponseSuggestedAt: integer("no_response_suggested_at", { mode: "timestamp_ms" }),
    /** CV sent: a variant id or "master" (cv-variants D5); null means unknown. */
    cvVariant: text("cv_variant"),
    /** The variant's name when sent, so deleted variants still read well. */
    cvVariantName: text("cv_variant_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("applications_offer_uq").on(t.offerId),
    index("applications_stage_idx").on(t.stage),
  ],
);

export const stageTransitions = sqliteTable(
  "stage_transitions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    note: text("note"),
    /** "manual" or "email" (application-emails D5). */
    source: text("source", { enum: TRANSITION_SOURCES }).notNull().default("manual"),
    /** The application email that made this change, when source is "email". */
    emailId: integer("email_id"),
    /** The portal application row that made this change, when source is "greenhouse". */
    portalApplicationId: integer("portal_application_id"),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("stage_transitions_app_idx").on(t.applicationId, t.at)],
);

/** AI interview preparation plans, one or more per application stage (latest wins). */
export const interviewPreps = sqliteTable(
  "interview_preps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    plan: text("plan", { mode: "json" }).$type<InterviewPlanData>().notNull(),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("interview_preps_app_idx").on(t.applicationId, t.createdAt)],
);

/** Mirror of core InterviewPlan (the db package does not depend on core). */
export interface InterviewPlanData {
  focus: string;
  likely_questions: { question: string; why_they_ask: string; answer_outline: string[] }[];
  strengths_to_highlight: { point: string; cv_evidence: string }[];
  gaps_to_prepare: { gap: string; how_to_prepare: string }[];
  questions_to_ask: string[];
  checklist: string[];
  verify: string[];
  company_context?: CompanyContextData | { unavailable: string };
}

export interface CompanyContextData {
  researchedAt: string;
  website: string | null;
  product: { text: string; source: string } | null;
  stage: { text: string; source: string } | null;
  news: { date: string; headline: string; source: string }[];
  red_flags: { text: string; source: string }[];
}

export const interviews = sqliteTable(
  "interviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: text("type", { enum: INTERVIEW_TYPES }).notNull(),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
    timeZone: text("time_zone").notNull(),
    durationMinutes: integer("duration_minutes"),
    interviewers: text("interviewers", { mode: "json" }).$type<string[]>().notNull().default([]),
    link: text("link"),
    prepNotes: text("prep_notes"),
    outcome: text("outcome"),
    reminderSentAt: integer("reminder_sent_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("interviews_scheduled_idx").on(t.scheduledAt)],
);

export const nextSteps = sqliteTable(
  "next_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("next_steps_app_uq").on(t.applicationId)],
);

export const engagements = sqliteTable("engagements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .notNull()
    .unique()
    .references(() => applications.id, { onDelete: "cascade" }),
  rateMinor: integer("rate_minor").notNull(),
  currency: text("currency").notNull(),
  ratePeriod: text("rate_period", { enum: COMP_PERIODS }).notNull(),
  weeklyHours: integer("weekly_hours").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  clientContact: text("client_contact"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const timelineEvents = sqliteTable(
  "timeline_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("timeline_offer_idx").on(t.offerId, t.at),
    index("timeline_application_idx").on(t.applicationId, t.at),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "set null" }),
    applicationId: integer("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    /** Guarantees "once per offer / once per interview" delivery. */
    dedupeKey: text("dedupe_key").unique(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    telegramStatus: text("telegram_status", { enum: TELEGRAM_STATUSES })
      .notNull()
      .default("pending"),
    telegramSentAt: integer("telegram_sent_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

export const llmUsage = sqliteTable(
  "llm_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Calendar day in the app time zone, YYYY-MM-DD. */
    day: text("day").notNull(),
    kind: text("kind", { enum: LLM_KINDS }).notNull(),
    model: text("model").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("llm_usage_day_kind_idx").on(t.day, t.kind)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/** Every triage decision with its structured reasons (offer-feedback spec). */
export const offerFeedback = sqliteTable(
  "offer_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: FEEDBACK_KINDS }).notNull(),
    reasons: text("reasons", { mode: "json" }).$type<string[]>().notNull().default([]),
    note: text("note"),
    learnable: integer("learnable", { mode: "boolean" }).notNull().default(true),
    withdrawnAt: integer("withdrawn_at", { mode: "timestamp_ms" }),
    learnedAt: integer("learned_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("offer_feedback_offer_idx").on(t.offerId),
    index("offer_feedback_pending_idx").on(t.learnedAt, t.kind),
  ],
);

/** Plain-language preferences learned from feedback or written by the owner. */
export const learnedPreferences = sqliteTable("learned_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  polarity: text("polarity", { enum: PREFERENCE_POLARITIES }).notNull(),
  status: text("status", { enum: LEARNED_STATUSES }).notNull().default("active"),
  origin: text("origin", { enum: LEARNED_ORIGINS }).notNull().default("learned"),
  /** Offer ids that support it. */
  evidence: text("evidence", { mode: "json" }).$type<number[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Changes to hard preferences proposed from feedback; applied only when accepted. */
export const preferenceSuggestions = sqliteTable(
  "preference_suggestions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: SUGGESTION_KINDS }).notNull(),
    currency: text("currency").notNull(),
    /** Major units (e.g. 65 = 65 EUR). */
    value: integer("value").notNull(),
    status: text("status", { enum: SUGGESTION_STATUSES }).notNull().default("pending"),
    evidence: text("evidence", { mode: "json" }).$type<number[]>().notNull().default([]),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("preference_suggestions_uq").on(t.kind, t.currency, t.value)],
);

/** Company research runs and their profiles (company-research spec). */
export const companyResearch = sqliteTable(
  "company_research",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** The offer that triggered it; its links are hints for finding the company. */
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "set null" }),
    reason: text("reason", { enum: RESEARCH_REASONS }).notNull(),
    status: text("status", { enum: RESEARCH_STATUSES }).notNull().default("queued"),
    /** Grounded company profile (core `CompanyProfile`). */
    profile: text("profile", { mode: "json" }).$type<Record<string, unknown>>(),
    readUrls: text("read_urls", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** Pages read, facts dropped, whether web search was unavailable. */
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    model: text("model"),
    /** Queued research waits until then (daily cap reached). */
    notBefore: integer("not_before", { mode: "timestamp_ms" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("company_research_company_idx").on(t.companyId, t.status)],
);

/** Owner's IMAP mailboxes read for replies (application-emails D1). Passwords live in secrets/. */
export const mailAccounts = sqliteTable("mail_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  address: text("address").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(993),
  folders: text("folders", { mode: "json" }).$type<string[]>().notNull().default(["INBOX"]),
  /** Job alerts (job-alert-mailboxes D1): read alert folders, and optionally known senders in INBOX. */
  jobAlerts: integer("job_alerts", { mode: "boolean" }).notNull().default(false),
  alertFolders: text("alert_folders", { mode: "json" }).$type<string[]>().notNull().default([]),
  alertsInInbox: integer("alerts_in_inbox", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  status: text("status", { enum: MAIL_ACCOUNT_STATUSES }).notNull().default("new"),
  lastError: text("last_error"),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const MAIL_CURSOR_PURPOSES = ["replies", "alerts"] as const;
export type MailCursorPurpose = (typeof MAIL_CURSOR_PURPOSES)[number];

/** Where reading stopped in each folder (IMAP UIDVALIDITY + last UID), per reader. */
export const mailCursors = sqliteTable(
  "mail_cursors",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    folder: text("folder").notNull(),
    /** Replies and job alerts read the same folders on different schedules. */
    purpose: text("purpose", { enum: MAIL_CURSOR_PURPOSES }).notNull().default("replies"),
    uidValidity: text("uid_validity").notNull(),
    lastUid: integer("last_uid").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("mail_cursors_uq").on(t.accountId, t.folder, t.purpose)],
);

/** What an automatic update changed, so Undo can revert it (application-emails D6). */
export interface EmailUndo {
  previousStage: string;
  targetStage: string | null;
  transitionId: number | null;
  previousNextStep: { description: string; dueAt: number | null; doneAt: number | null } | null;
  nextStepId: number | null;
  nextStep: { description: string; dueAt: number | null } | null;
  interviewId: number | null;
  interviewScheduledAt: number | null;
  previousFirstResponseAt: number | null;
}

/** Replies matched to applications (application-emails D6). Only these fields are kept. */
export const applicationEmails = sqliteTable(
  "application_emails",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").references(() => mailAccounts.id, { onDelete: "set null" }),
    messageId: text("message_id").notNull(),
    folder: text("folder").notNull(),
    uid: integer("uid"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    fromName: text("from_name"),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull().default(""),
    excerpt: text("excerpt").notNull().default(""),
    /** Candidate application ids from the prefilter. */
    candidates: text("candidates", { mode: "json" }).$type<number[]>().notNull().default([]),
    applicationId: integer("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    category: text("category", { enum: EMAIL_CATEGORIES }),
    confidence: text("confidence", { enum: EMAIL_CONFIDENCES }),
    summary: text("summary"),
    /** Validated model result (next step, interview, target stage). */
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status", { enum: EMAIL_STATUSES }).notNull().default("queued"),
    undo: text("undo", { mode: "json" }).$type<EmailUndo>(),
    /** Body kept only while queued for classification; cleared once classified. */
    pendingBody: text("pending_body"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("application_emails_message_uq").on(t.messageId),
    index("application_emails_app_idx").on(t.applicationId, t.receivedAt),
    index("application_emails_status_idx").on(t.status),
  ],
);

/**
 * Applications read from a candidate portal (mygreenhouse-source D4): one row per portal
 * application, updated only when its status changes. Holds the latest update and its Undo.
 */
export const portalApplications = sqliteTable(
  "portal_applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    /** The portal's application id. */
    portalId: text("portal_id").notNull(),
    /** `<board>:<jobId>` when the portal links a public job. */
    jobKey: text("job_key"),
    company: text("company").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    applicationId: integer("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    lastStatus: text("last_status").notNull(),
    statusSeenAt: integer("status_seen_at", { mode: "timestamp_ms" }).notNull(),
    category: text("category", { enum: PORTAL_CATEGORIES }).notNull(),
    /** Candidate application ids when matching was not sure. */
    candidates: text("candidates", { mode: "json" }).$type<number[]>().notNull().default([]),
    status: text("status", { enum: PORTAL_UPDATE_STATUSES }).notNull(),
    /** The suggested or applied target stage, and why it was not applied automatically. */
    pending: text("pending", { mode: "json" }).$type<{
      targetStage: string | null;
      reasons: string[];
    }>(),
    undo: text("undo", { mode: "json" }).$type<EmailUndo>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("portal_applications_uq").on(t.source, t.portalId),
    index("portal_applications_app_idx").on(t.applicationId),
    index("portal_applications_status_idx").on(t.status),
  ],
);

/** People behind offers (contacts spec; people-directory D1). */
export const people = sqliteTable(
  "people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Where the person works; optional (people-directory D1). */
    companyId: integer("company_id").references(() => companies.id),
    name: text("name").notNull(),
    role: text("role"),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    phone: text("phone"),
    other: text("other"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("people_company_idx").on(t.companyId)],
);

export const offerPeople = sqliteTable(
  "offer_people",
  {
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("offer_people_uq").on(t.offerId, t.personId),
    index("offer_people_person_idx").on(t.personId),
  ],
);

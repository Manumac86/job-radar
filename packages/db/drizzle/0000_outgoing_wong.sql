CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer NOT NULL,
	`stage` text DEFAULT 'applied' NOT NULL,
	`sent_draft_id` integer,
	`applied_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_activity_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`first_response_at` integer,
	`closed_at` integer,
	`no_response_suggested_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_offer_uq` ON `applications` (`offer_id`);--> statement-breakpoint
CREATE INDEX `applications_stage_idx` ON `applications` (`stage`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`website` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_normalized_name_uq` ON `companies` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `custom_stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	`is_closing` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_stages_key_unique` ON `custom_stages` (`key`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer NOT NULL,
	`version` integer NOT NULL,
	`message` text NOT NULL,
	`screening_answers` text DEFAULT '[]' NOT NULL,
	`suggested_rate` text,
	`verify_before_sending` text DEFAULT '[]' NOT NULL,
	`instruction` text,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drafts_offer_version_uq` ON `drafts` (`offer_id`,`version`);--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`rate_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`rate_period` text NOT NULL,
	`weekly_hours` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`client_contact` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_application_id_unique` ON `engagements` (`application_id`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`type` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`time_zone` text NOT NULL,
	`duration_minutes` integer,
	`interviewers` text DEFAULT '[]' NOT NULL,
	`link` text,
	`prep_notes` text,
	`outcome` text,
	`reminder_sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interviews_scheduled_idx` ON `interviews` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`model` text NOT NULL,
	`ok` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`duration_ms` integer,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_usage_day_kind_idx` ON `llm_usage` (`day`,`kind`);--> statement-breakpoint
CREATE TABLE `next_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`description` text NOT NULL,
	`due_at` integer,
	`done_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `next_steps_app_uq` ON `next_steps` (`application_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`offer_id` integer,
	`application_id` integer,
	`dedupe_key` text,
	`read_at` integer,
	`telegram_status` text DEFAULT 'pending' NOT NULL,
	`telegram_sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_key_unique` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `offer_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`seen_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offer_links_source_external_uq` ON `offer_links` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`company_id` integer,
	`company_name` text NOT NULL,
	`company_website` text,
	`location` text,
	`remote_policy` text DEFAULT 'unknown' NOT NULL,
	`regions` text DEFAULT '[]' NOT NULL,
	`engagement_type` text DEFAULT 'unknown' NOT NULL,
	`comp_min` integer,
	`comp_max` integer,
	`comp_currency` text,
	`comp_period` text,
	`rate_unknown` integer DEFAULT true NOT NULL,
	`equity_min` real,
	`equity_max` real,
	`posted_at` integer,
	`description` text DEFAULT '' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`apply_method` text,
	`apply_url` text,
	`company_meta` text DEFAULT '{}' NOT NULL,
	`raw` text,
	`triage` text DEFAULT 'new' NOT NULL,
	`triage_reason` text,
	`score_status` text DEFAULT 'awaiting_score' NOT NULL,
	`score_error` text,
	`score` integer,
	`score_class` text,
	`first_seen_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_seen_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offers_source_external_uq` ON `offers` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `offers_dedupe_idx` ON `offers` (`company_id`,`normalized_title`);--> statement-breakpoint
CREATE INDEX `offers_score_idx` ON `offers` (`score`);--> statement-breakpoint
CREATE INDEX `offers_triage_idx` ON `offers` (`triage`);--> statement-breakpoint
CREATE INDEX `offers_score_status_idx` ON `offers` (`score_status`);--> statement-breakpoint
CREATE TABLE `profiles_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`loaded_at` integer NOT NULL,
	`status` text NOT NULL,
	`cv_hash` text,
	`preferences_hash` text,
	`errors` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`finished_at` integer,
	`found` integer DEFAULT 0 NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`filtered` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`error` text,
	`log` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runs_source_started_idx` ON `runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer NOT NULL,
	`overall` integer NOT NULL,
	`model_overall` integer NOT NULL,
	`skills_fit` integer NOT NULL,
	`seniority_fit` integer NOT NULL,
	`rate_fit` integer NOT NULL,
	`location_fit` integer NOT NULL,
	`engagement_fit` integer NOT NULL,
	`score_class` text NOT NULL,
	`rationale` text NOT NULL,
	`red_flags` text DEFAULT '[]' NOT NULL,
	`service_lines` text DEFAULT '[]' NOT NULL,
	`is_leadership` integer DEFAULT false NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scores_offer_idx` ON `scores` (`offer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`interval_minutes` integer DEFAULT 360 NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`stopped_until` integer,
	`last_run_at` integer,
	`requires_login` integer DEFAULT false NOT NULL,
	`risk_acknowledged_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stage_transitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`note` text,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stage_transitions_app_idx` ON `stage_transitions` (`application_id`,`at`);--> statement-breakpoint
CREATE TABLE `timeline_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer,
	`application_id` integer,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `timeline_offer_idx` ON `timeline_events` (`offer_id`,`at`);--> statement-breakpoint
CREATE INDEX `timeline_application_idx` ON `timeline_events` (`application_id`,`at`);
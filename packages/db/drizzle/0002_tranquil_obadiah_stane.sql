CREATE TABLE `learned_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`polarity` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`origin` text DEFAULT 'learned' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offer_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offer_id` integer NOT NULL,
	`kind` text NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`note` text,
	`learnable` integer DEFAULT true NOT NULL,
	`withdrawn_at` integer,
	`learned_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `offer_feedback_offer_idx` ON `offer_feedback` (`offer_id`);--> statement-breakpoint
CREATE INDEX `offer_feedback_pending_idx` ON `offer_feedback` (`learned_at`,`kind`);--> statement-breakpoint
CREATE TABLE `preference_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`value` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`decided_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preference_suggestions_uq` ON `preference_suggestions` (`kind`,`currency`,`value`);--> statement-breakpoint
-- Backfill: dismissals with a free-text reason become learnable feedback ("other" + note).
INSERT INTO `offer_feedback` (`offer_id`, `kind`, `reasons`, `note`, `learnable`, `created_at`)
SELECT `id`, 'dismissed', '["other"]', substr(`triage_reason`, 1, 300), 1, `updated_at`
FROM `offers`
WHERE `triage` = 'dismissed' AND `triage_reason` IS NOT NULL AND trim(`triage_reason`) <> '';

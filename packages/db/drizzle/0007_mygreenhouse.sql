CREATE TABLE `portal_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`portal_id` text NOT NULL,
	`job_key` text,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`application_id` integer,
	`last_status` text NOT NULL,
	`status_seen_at` integer NOT NULL,
	`category` text NOT NULL,
	`candidates` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`pending` text,
	`undo` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_applications_uq` ON `portal_applications` (`source`,`portal_id`);--> statement-breakpoint
CREATE INDEX `portal_applications_app_idx` ON `portal_applications` (`application_id`);--> statement-breakpoint
CREATE INDEX `portal_applications_status_idx` ON `portal_applications` (`status`);--> statement-breakpoint
ALTER TABLE `stage_transitions` ADD `portal_application_id` integer;
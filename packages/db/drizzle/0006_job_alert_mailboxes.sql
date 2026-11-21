DROP INDEX `mail_cursors_uq`;--> statement-breakpoint
ALTER TABLE `mail_cursors` ADD `purpose` text DEFAULT 'replies' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `mail_cursors_uq` ON `mail_cursors` (`account_id`,`folder`,`purpose`);--> statement-breakpoint
ALTER TABLE `mail_accounts` ADD `job_alerts` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mail_accounts` ADD `alert_folders` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `mail_accounts` ADD `alerts_in_inbox` integer DEFAULT false NOT NULL;
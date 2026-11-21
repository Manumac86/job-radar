CREATE TABLE `application_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`message_id` text NOT NULL,
	`folder` text NOT NULL,
	`uid` integer,
	`received_at` integer NOT NULL,
	`from_name` text,
	`from_address` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`candidates` text DEFAULT '[]' NOT NULL,
	`application_id` integer,
	`category` text,
	`confidence` text,
	`summary` text,
	`result` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`undo` text,
	`pending_body` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_emails_message_uq` ON `application_emails` (`message_id`);--> statement-breakpoint
CREATE INDEX `application_emails_app_idx` ON `application_emails` (`application_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `application_emails_status_idx` ON `application_emails` (`status`);--> statement-breakpoint
CREATE TABLE `mail_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`address` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 993 NOT NULL,
	`folders` text DEFAULT '["INBOX"]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`last_error` text,
	`last_checked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_cursors` (
	`account_id` integer NOT NULL,
	`folder` text NOT NULL,
	`uid_validity` text NOT NULL,
	`last_uid` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_cursors_uq` ON `mail_cursors` (`account_id`,`folder`);--> statement-breakpoint
ALTER TABLE `stage_transitions` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `stage_transitions` ADD `email_id` integer;
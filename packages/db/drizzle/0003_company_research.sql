CREATE TABLE `company_research` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`offer_id` integer,
	`reason` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`profile` text,
	`read_urls` text DEFAULT '[]' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`error` text,
	`model` text,
	`not_before` integer,
	`started_at` integer,
	`finished_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `company_research_company_idx` ON `company_research` (`company_id`,`status`);--> statement-breakpoint
ALTER TABLE `drafts` ADD `company_facts_used` text DEFAULT '[]' NOT NULL;
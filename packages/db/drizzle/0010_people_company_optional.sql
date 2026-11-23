PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer,
	`name` text NOT NULL,
	`role` text,
	`linkedin_url` text,
	`email` text,
	`phone` text,
	`other` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_people`("id", "company_id", "name", "role", "linkedin_url", "email", "phone", "other", "note", "created_at", "updated_at") SELECT "id", "company_id", "name", "role", "linkedin_url", "email", "phone", "other", "note", "created_at", "updated_at" FROM `people`;--> statement-breakpoint
DROP TABLE `people`;--> statement-breakpoint
ALTER TABLE `__new_people` RENAME TO `people`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `people_company_idx` ON `people` (`company_id`);
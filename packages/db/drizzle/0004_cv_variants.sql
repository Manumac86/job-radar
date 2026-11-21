ALTER TABLE `applications` ADD `cv_variant` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `cv_variant_name` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `cv_variant` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `cv_variant_name` text;--> statement-breakpoint
ALTER TABLE `scores` ADD `recommended_cv` text;--> statement-breakpoint
ALTER TABLE `scores` ADD `cv_reason` text;--> statement-breakpoint
ALTER TABLE `scores` ADD `cv_gaps` text;--> statement-breakpoint
ALTER TABLE `scores` ADD `cv_variants_hash` text;
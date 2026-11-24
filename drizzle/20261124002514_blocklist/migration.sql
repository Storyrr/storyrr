CREATE TABLE `blocklist_item` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`cover_url` text,
	`reason` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_blocklist_item_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocklist_item_source_external_id_idx` ON `blocklist_item` (`source`,`external_id`);
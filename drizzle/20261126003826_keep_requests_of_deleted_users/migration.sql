-- The requester becomes optional (ON DELETE SET NULL), which SQLite can only do by
-- rebuilding the table. Migrations run in a transaction, where `PRAGMA foreign_keys=OFF`
-- has no effect: dropping `request` would delete, by cascade, every row that points to
-- it. They are set aside first and put back once the new table has its name.
CREATE TABLE `__kept_request_event` AS SELECT * FROM `request_event`;--> statement-breakpoint
CREATE TABLE `__kept_request_watcher` AS SELECT * FROM `request_watcher`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_request` (
	`id` text PRIMARY KEY,
	`media_id` text NOT NULL,
	`user_id` text,
	`format` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`target` text NOT NULL,
	`target_key` text NOT NULL,
	`quality_profile_id` integer,
	`backend_ref` text,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_request_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_request_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_request`(`id`, `media_id`, `user_id`, `format`, `status`, `target`, `target_key`, `quality_profile_id`, `backend_ref`, `last_error`, `created_at`, `updated_at`) SELECT `id`, `media_id`, `user_id`, `format`, `status`, `target`, `target_key`, `quality_profile_id`, `backend_ref`, `last_error`, `created_at`, `updated_at` FROM `request`;--> statement-breakpoint
DROP TABLE `request`;--> statement-breakpoint
ALTER TABLE `__new_request` RENAME TO `request`;--> statement-breakpoint
INSERT INTO `request_event` SELECT * FROM `__kept_request_event`;--> statement-breakpoint
INSERT INTO `request_watcher` SELECT * FROM `__kept_request_watcher`;--> statement-breakpoint
DROP TABLE `__kept_request_event`;--> statement-breakpoint
DROP TABLE `__kept_request_watcher`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `request_user_id_idx` ON `request` (`user_id`);--> statement-breakpoint
CREATE INDEX `request_status_idx` ON `request` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `request_active_slot_idx` ON `request` (`media_id`,`format`,`target_key`) WHERE status in ('pending', 'approved', 'submitted', 'available', 'failed');
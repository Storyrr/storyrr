CREATE TABLE `media` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`authors` text DEFAULT '[]' NOT NULL,
	`narrators` text DEFAULT '[]' NOT NULL,
	`series` text,
	`language` text,
	`cover_url` text,
	`metadata` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request` (
	`id` text PRIMARY KEY,
	`media_id` text NOT NULL,
	`user_id` text NOT NULL,
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
	CONSTRAINT `fk_request_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `request_event` (
	`id` text PRIMARY KEY,
	`request_id` text NOT NULL,
	`actor` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`message` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_request_event_request_id_request_id_fk` FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `request_watcher` (
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `request_watcher_pk` PRIMARY KEY(`request_id`, `user_id`),
	CONSTRAINT `fk_request_watcher_request_id_request_id_fk` FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_request_watcher_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_preference` (
	`user_id` text PRIMARY KEY,
	`auto_approve` integer DEFAULT false NOT NULL,
	`locale` text,
	`abs_user_id` text,
	CONSTRAINT `fk_user_preference_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_source_external_id_idx` ON `media` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `request_user_id_idx` ON `request` (`user_id`);--> statement-breakpoint
CREATE INDEX `request_status_idx` ON `request` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `request_active_slot_idx` ON `request` (`media_id`,`format`,`target_key`) WHERE status in ('pending', 'approved', 'submitted', 'available', 'failed');--> statement-breakpoint
CREATE INDEX `request_event_request_id_idx` ON `request_event` (`request_id`);
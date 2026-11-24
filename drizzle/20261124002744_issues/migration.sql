CREATE TABLE `issue` (
	`id` text PRIMARY KEY,
	`media_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `issue_comment` (
	`id` text PRIMARY KEY,
	`issue_id` text NOT NULL,
	`user_id` text,
	`message` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_comment_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_comment_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `issue_status_idx` ON `issue` (`status`);--> statement-breakpoint
CREATE INDEX `issue_user_id_idx` ON `issue` (`user_id`);--> statement-breakpoint
CREATE INDEX `issue_comment_issue_id_idx` ON `issue_comment` (`issue_id`);
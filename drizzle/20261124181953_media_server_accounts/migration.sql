CREATE TABLE `media_server_account` (
	`server` text NOT NULL,
	`account_key` text NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `media_server_account_pk` PRIMARY KEY(`server`, `account_key`),
	CONSTRAINT `fk_media_server_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `library_item` ADD `format` text;--> statement-breakpoint
UPDATE `library_item` SET `format` = CASE `backend` WHEN 'audiobookshelf' THEN 'audiobook' ELSE 'ebook' END;--> statement-breakpoint
CREATE INDEX `library_item_format_key_idx` ON `library_item` (`format`,`match_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_server_account_user_idx` ON `media_server_account` (`server`,`user_id`);--> statement-breakpoint
-- Keep the existing links (sign in with Audiobookshelf / Kavita, imported users).
INSERT OR IGNORE INTO `media_server_account` (`server`, `account_key`, `user_id`) SELECT 'audiobookshelf', `abs_user_id`, `user_id` FROM `user_preference` WHERE `abs_user_id` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `media_server_account` (`server`, `account_key`, `user_id`) SELECT 'kavita', `kavita_user`, `user_id` FROM `user_preference` WHERE `kavita_user` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `user_preference` DROP COLUMN `abs_user_id`;--> statement-breakpoint
ALTER TABLE `user_preference` DROP COLUMN `kavita_user`;
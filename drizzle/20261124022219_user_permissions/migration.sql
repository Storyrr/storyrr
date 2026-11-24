ALTER TABLE `user_preference` ADD `permissions` text;--> statement-breakpoint
-- Keep auto-approval: users who had it get the default permissions plus auto-approval for both formats.
UPDATE `user_preference` SET `permissions` = '["request_audiobook","request_ebook","create_issues","auto_approve_audiobook","auto_approve_ebook"]' WHERE `auto_approve` = 1;--> statement-breakpoint
ALTER TABLE `user_preference` DROP COLUMN `auto_approve`;

ALTER TABLE `library_item` ADD `match_key` text;--> statement-breakpoint
CREATE INDEX `library_item_match_key_idx` ON `library_item` (`backend`,`match_key`);
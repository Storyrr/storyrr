ALTER TABLE `library_item` ADD `path_key` text;--> statement-breakpoint
CREATE INDEX `library_item_path_key_idx` ON `library_item` (`path_key`);
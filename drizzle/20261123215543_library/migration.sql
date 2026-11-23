CREATE TABLE `library_item` (
	`backend` text NOT NULL,
	`item_id` text NOT NULL,
	`library_id` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`synced_at` integer NOT NULL,
	CONSTRAINT `library_item_pk` PRIMARY KEY(`backend`, `item_id`)
);
--> statement-breakpoint
CREATE INDEX `library_item_external_id_idx` ON `library_item` (`external_id`);
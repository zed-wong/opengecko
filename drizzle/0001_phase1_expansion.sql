ALTER TABLE `coins` ADD `hashing_algorithm` text;
--> statement-breakpoint
ALTER TABLE `coins` ADD `block_time_in_minutes` integer;
--> statement-breakpoint
ALTER TABLE `coins` ADD `categories_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `coins` ADD `description_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `coins` ADD `links_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `coins` ADD `image_thumb_url` text;
--> statement-breakpoint
ALTER TABLE `coins` ADD `image_small_url` text;
--> statement-breakpoint
ALTER TABLE `coins` ADD `image_large_url` text;
--> statement-breakpoint
ALTER TABLE `coins` ADD `market_cap_rank` integer;
--> statement-breakpoint
ALTER TABLE `coins` ADD `genesis_date` text;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `market_cap_rank` integer;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `fully_diluted_valuation` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `circulating_supply` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `total_supply` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `max_supply` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `ath` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `ath_change_percentage` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `ath_date` integer;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `atl` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `atl_change_percentage` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `atl_date` integer;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `price_change_24h` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `price_change_percentage_24h` real;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `last_updated` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `market_snapshots` SET `last_updated` = `updated_at` WHERE `last_updated` = 0;
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`market_cap` real,
	`market_cap_change_24h` real,
	`volume_24h` real,
	`content` text,
	`top_3_coins_json` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chart_points` (
	`coin_id` text NOT NULL,
	`vs_currency` text NOT NULL,
	`timestamp` integer NOT NULL,
	`price` real NOT NULL,
	`market_cap` real,
	`total_volume` real,
	PRIMARY KEY(`coin_id`, `vs_currency`, `timestamp`),
	FOREIGN KEY (`coin_id`) REFERENCES `coins`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `asset_platforms` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_identifier` integer,
	`name` text NOT NULL,
	`shortname` text NOT NULL,
	`native_coin_id` text,
	`image_url` text,
	`is_nft` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coins` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`api_symbol` text NOT NULL,
	`platforms_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`coin_id` text NOT NULL,
	`vs_currency` text NOT NULL,
	`price` real NOT NULL,
	`market_cap` real,
	`total_volume` real,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`coin_id`, `vs_currency`),
	FOREIGN KEY (`coin_id`) REFERENCES `coins`(`id`) ON UPDATE no action ON DELETE no action
);

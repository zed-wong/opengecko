CREATE TABLE `quote_snapshots` (
	`coin_id` text NOT NULL,
	`vs_currency` text NOT NULL,
	`exchange_id` text NOT NULL,
	`symbol` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`price` real NOT NULL,
	`quote_volume` real,
	`price_change_percentage_24h` real,
	`source_payload_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`coin_id`, `vs_currency`, `exchange_id`, `symbol`, `fetched_at`),
	FOREIGN KEY (`coin_id`) REFERENCES `coins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ohlcv_candles` (
	`coin_id` text NOT NULL,
	`vs_currency` text NOT NULL,
	`source` text DEFAULT 'canonical' NOT NULL,
	`interval` text NOT NULL,
	`timestamp` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real,
	`market_cap` real,
	`total_volume` real,
	PRIMARY KEY(`coin_id`, `vs_currency`, `source`, `interval`, `timestamp`),
	FOREIGN KEY (`coin_id`) REFERENCES `coins`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year_established` integer,
	`country` text,
	`description` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`image_url` text,
	`has_trading_incentive` integer DEFAULT false NOT NULL,
	`trust_score` integer,
	`trust_score_rank` integer,
	`trade_volume_24h_btc` real,
	`trade_volume_24h_btc_normalized` real,
	`facebook_url` text,
	`reddit_url` text,
	`telegram_url` text,
	`slack_url` text,
	`other_url_json` text DEFAULT '[]' NOT NULL,
	`twitter_handle` text,
	`centralised` integer DEFAULT true NOT NULL,
	`public_notice` text,
	`alert_notice` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_volume_points` (
	`exchange_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`volume_btc` real NOT NULL,
	PRIMARY KEY(`exchange_id`, `timestamp`),
	FOREIGN KEY (`exchange_id`) REFERENCES `exchanges`(`id`) ON UPDATE no action ON DELETE no action
);

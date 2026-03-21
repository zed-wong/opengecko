CREATE TABLE `derivatives_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`open_interest_btc` real,
	`trade_volume_24h_btc` real,
	`number_of_perpetual_pairs` integer,
	`number_of_futures_pairs` integer,
	`year_established` integer,
	`country` text,
	`description` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`image_url` text,
	`centralised` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);

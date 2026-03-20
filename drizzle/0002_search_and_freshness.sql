ALTER TABLE `market_snapshots` ADD `source_providers_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD `source_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `search_documents` USING fts5(
	`doc_type` UNINDEXED,
	`ref_id` UNINDEXED,
	`name`,
	`symbol`,
	`api_symbol`,
	`categories`,
	tokenize = 'unicode61'
);

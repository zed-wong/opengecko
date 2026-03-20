export const DEFAULT_CCXT_EXCHANGES = ['binance', 'coinbase', 'kraken'] as const;

export const DEFAULT_MARKET_FRESHNESS_THRESHOLD_SECONDS = 300;
export const DEFAULT_MARKET_REFRESH_INTERVAL_SECONDS = 60;
export const DEFAULT_SEARCH_REBUILD_INTERVAL_SECONDS = 900;

export const STALE_DATA_POLICY = {
  seededSnapshotsRemainUsable: true,
  omitStaleLiveSnapshotsFromSimpleResponses: true,
  omitStaleLiveSnapshotsFromGlobalAggregates: true,
  nullOutStaleLiveMarketFieldsInDetailResponses: true,
} as const;

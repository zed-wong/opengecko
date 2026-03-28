export const SNAPSHOT_MANIFEST_FORMAT_VERSION = 1 as const;
export const SNAPSHOT_ARTIFACT_FORMAT_VERSION = 1 as const;
export const SNAPSHOT_CAPTURE_BOUND = 10 as const;

export type SnapshotManifestEntry = {
  id: string;
  path: string;
  query?: Record<string, string>;
  variantId?: string;
  enabled?: boolean;
  note?: string;
};

export type SnapshotManifest = {
  manifestId: string;
  formatVersion: number;
  artifactFormatVersion: number;
  maxRequests: number;
  entries: SnapshotManifestEntry[];
};

export const coingeckoSnapshotManifest: SnapshotManifest = {
  manifestId: 'coingecko-pro-bounded-v1',
  formatVersion: SNAPSHOT_MANIFEST_FORMAT_VERSION,
  artifactFormatVersion: SNAPSHOT_ARTIFACT_FORMAT_VERSION,
  maxRequests: SNAPSHOT_CAPTURE_BOUND,
  entries: [
    {
      id: 'simple-price-canonical',
      path: '/simple/price',
      query: {
        ids: 'bitcoin,ethereum',
        vs_currencies: 'usd',
        include_market_cap: 'true',
        include_24hr_vol: 'true',
        include_24hr_change: 'true',
        include_last_updated_at: 'true',
      },
      note: 'Canonical hot-path quote sample.',
    },
    {
      id: 'simple-token-price-ethereum-usdc',
      path: '/simple/token_price/ethereum',
      query: {
        contract_addresses: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        vs_currencies: 'usd',
        include_market_cap: 'true',
        include_24hr_vol: 'true',
        include_24hr_change: 'true',
        include_last_updated_at: 'true',
      },
      note: 'Canonical token-price sample for platform+contract identity.',
    },
    {
      id: 'coins-markets-canonical',
      path: '/coins/markets',
      query: {
        vs_currency: 'usd',
        ids: 'bitcoin,ethereum,solana',
        order: 'market_cap_desc',
        per_page: '3',
        page: '1',
        sparkline: 'false',
        price_change_percentage: '24h,7d',
      },
    },
    {
      id: 'coin-detail-bitcoin',
      path: '/coins/bitcoin',
      query: {
        localization: 'false',
        tickers: 'false',
        market_data: 'true',
        community_data: 'false',
        developer_data: 'false',
        sparkline: 'false',
      },
    },
    {
      id: 'global-canonical',
      path: '/global',
    },
    {
      id: 'exchange-rates-canonical',
      path: '/exchange_rates',
    },
    {
      id: 'exchanges-canonical',
      path: '/exchanges',
      query: {
        per_page: '5',
        page: '1',
      },
    },
    {
      id: 'exchange-detail-binance',
      path: '/exchanges/binance',
    },
    {
      id: 'exchange-tickers-binance',
      path: '/exchanges/binance/tickers',
      query: {
        page: '1',
      },
    },
  ],
};

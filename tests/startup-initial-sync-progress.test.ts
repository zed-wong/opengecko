import { describe, expect, it, vi } from 'vitest';

import { runInitialMarketSync } from '../src/services/initial-sync';

vi.mock('../src/services/coin-catalog-sync', () => ({
  syncCoinCatalogFromExchanges: vi.fn().mockResolvedValue({ insertedOrUpdated: 1 }),
}));

vi.mock('../src/services/chain-catalog-sync', () => ({
  syncChainCatalogFromExchanges: vi.fn().mockResolvedValue({ insertedOrUpdated: 0 }),
}));

vi.mock('../src/services/market-refresh', () => ({
  runMarketRefreshOnce: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/providers/ccxt', () => ({
  fetchExchangeMarkets: vi.fn(),
  fetchExchangeTickers: vi.fn(),
  fetchExchangeOHLCV: vi.fn(),
  fetchExchangeNetworks: vi.fn().mockResolvedValue([]),
  isValidExchangeId: (value: string): value is string => ['binance'].includes(value),
}));

import {
  fetchExchangeMarkets,
  fetchExchangeOHLCV,
  fetchExchangeTickers,
} from '../src/providers/ccxt';

describe('initial sync startup progress', () => {
  it('reports step transitions and OHLCV subprogress', async () => {
    const mockedFetchExchangeMarkets = fetchExchangeMarkets as ReturnType<typeof vi.fn>;
    const mockedFetchExchangeTickers = fetchExchangeTickers as ReturnType<typeof vi.fn>;
    const mockedFetchExchangeOHLCV = fetchExchangeOHLCV as ReturnType<typeof vi.fn>;

    mockedFetchExchangeMarkets.mockImplementation(async (exchangeId: string) => {
      if (exchangeId === 'binance') {
        return [{ exchangeId: 'binance', symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', active: true, spot: true, baseName: 'Bitcoin', raw: {} }];
      }

      return [];
    });
    mockedFetchExchangeTickers.mockImplementation(async (exchangeId: string) => {
      if (exchangeId === 'binance') {
        return [{
          exchangeId: 'binance',
          symbol: 'BTC/USDT',
          base: 'BTC',
          quote: 'USDT',
          last: 90_000,
          bid: null,
          ask: null,
          high: null,
          low: null,
          baseVolume: null,
          quoteVolume: null,
          percentage: null,
          timestamp: Date.now(),
          raw: {} as never,
        }];
      }

      return [];
    });
    mockedFetchExchangeOHLCV.mockResolvedValue([
      { exchangeId: 'binance', symbol: 'BTC/USDT', timeframe: '1d', timestamp: Date.parse('2026-03-01T00:00:00Z'), open: 80_000, high: 82_000, low: 79_000, close: 81_000, volume: 1_000, raw: [0, 0, 0, 0, 0, 0] },
    ]);

    const transitions: string[] = [];
    const subprogress: Array<{ current: number; total: number }> = [];
    let selectCall = 0;
    const database = {
      db: {
        insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ run: () => undefined }) }) }),
        select: () => ({
          from: () => {
            selectCall += 1;

            if (selectCall === 1) {
              return { all: () => [{ value: 1 }] };
            }

            if (selectCall === 2) {
              return { limit: () => ({ all: () => [] }) };
            }

            return { all: () => [{ id: 'bitcoin', symbol: 'btc' }] };
          },
        }),
      },
    } as never;

    await runInitialMarketSync(
      database,
      { ccxtExchanges: ['binance'], marketFreshnessThresholdSeconds: 300 },
      undefined,
      {
        onStepChange: (stepId: string) => {
          transitions.push(stepId);
        },
        onOhlcvBackfillProgress: (current: number, total: number) => {
          subprogress.push({ current, total });
        },
      },
    );

    expect(transitions).toEqual([
      'sync_exchange_metadata',
      'sync_coin_catalog',
      'sync_chain_catalog',
      'build_market_snapshots',
      'backfill_ohlcv',
    ]);
    expect(subprogress).toContainEqual({ current: 0, total: 1 });
    expect(subprogress).toContainEqual({ current: 1, total: 1 });
  });
});

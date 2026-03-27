import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app';
import type { OhlcvSyncSummary } from '../src/services/ohlcv-runtime';
import * as ohlcvRuntimeModule from '../src/services/ohlcv-runtime';
import * as defillamaProvider from '../src/providers/defillama';

vi.mock('../src/providers/ccxt', () => ({
  fetchExchangeMarkets: vi.fn().mockResolvedValue([]),
  fetchExchangeTickers: vi.fn().mockResolvedValue([]),
  fetchExchangeOHLCV: vi.fn().mockResolvedValue([]),
  fetchExchangeNetworks: vi.fn().mockResolvedValue([]),
  closeExchangePool: vi.fn().mockResolvedValue(undefined),
  isValidExchangeId: (value: string): value is string =>
    ['binance', 'coinbase', 'kraken', 'bybit', 'okx'].includes(value),
}));

describe('ohlcv diagnostics route', () => {
  let app: FastifyInstance;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opengecko-ohlcv-diagnostics-'));
    vi.spyOn(defillamaProvider, 'fetchDefillamaTokenPrices').mockResolvedValue(null);
    app = buildApp({
      config: {
        databaseUrl: join(tempDir, 'test.db'),
        ccxtExchanges: [],
        logLevel: 'silent',
      },
      startBackgroundJobs: false,
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('mirrors summarized ohlcv sync metrics at the HTTP boundary', async () => {
    const summary: OhlcvSyncSummary = {
      top100: {
        total: 100,
        ready: 97,
      },
      targets: {
        waiting: 11,
        running: 2,
        failed: 3,
      },
      lag: {
        oldest_recent_sync_ms: 120_000,
        oldest_historical_gap_ms: 86_400_000,
      },
      backfill: {
        healthy: 94,
        behind: 6,
        retry_scheduled: 3,
        max_target_history_days: 365,
      },
    };

    const summarizeSpy = vi
      .spyOn(ohlcvRuntimeModule, 'summarizeOhlcvSyncStatus')
      .mockReturnValue(summary);

    const response = await app.inject({
      method: 'GET',
      url: '/diagnostics/ohlcv_sync',
    });

    expect(response.statusCode).toBe(200);
    expect(summarizeSpy).toHaveBeenCalledTimes(1);
    expect(summarizeSpy).toHaveBeenCalledWith(app.db, expect.any(Date));
    expect(response.json()).toEqual({
      data: {
        top100: {
          total: 100,
          ready: 97,
        },
        targets: {
          waiting: 11,
          running: 2,
          failed: 3,
        },
        lag: {
          oldest_recent_sync_ms: 120_000,
          oldest_historical_gap_ms: 86_400_000,
        },
        backfill: {
          healthy: 94,
          behind: 6,
          retry_scheduled: 3,
          max_target_history_days: 365,
        },
      },
    });

    expect(response.json().data.top100.total).toBeGreaterThanOrEqual(response.json().data.top100.ready);
    expect(response.json().data.targets.waiting).toBeGreaterThanOrEqual(0);
    expect(response.json().data.targets.running).toBeGreaterThanOrEqual(0);
    expect(response.json().data.targets.failed).toBeGreaterThanOrEqual(0);
    expect(response.json().data.lag.oldest_recent_sync_ms).toBeGreaterThanOrEqual(0);
    expect(response.json().data.lag.oldest_historical_gap_ms).toBeGreaterThanOrEqual(0);
    expect(response.json().data.backfill.healthy).toBeGreaterThanOrEqual(0);
    expect(response.json().data.backfill.behind).toBeGreaterThanOrEqual(0);
    expect(response.json().data.backfill.retry_scheduled).toBeGreaterThanOrEqual(0);
    expect(response.json().data.backfill.max_target_history_days).toBeGreaterThanOrEqual(0);
  });
});

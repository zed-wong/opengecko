import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOhlcvRuntime } from '../src/services/ohlcv-runtime';

describe('ohlcv runtime', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prioritizes top100 recent catch-up before long-tail historical deepening', async () => {
    const syncRecentOhlcvWindow = vi.fn().mockResolvedValue([{ timestamp: Date.parse('2026-03-22T00:00:00.000Z') }]);
    const deepenHistoricalOhlcvWindow = vi.fn().mockResolvedValue([]);
    const leaseNextOhlcvTarget = vi.fn().mockReturnValue({
      coinId: 'bitcoin',
      exchangeId: 'binance',
      symbol: 'BTC/USDT',
      vsCurrency: 'usd',
      interval: '1d',
      priorityTier: 'top100',
      latestSyncedAt: new Date('2026-03-21T00:00:00.000Z'),
      oldestSyncedAt: new Date('2025-03-22T00:00:00.000Z'),
      targetHistoryDays: 365,
    });
    const runtime = createOhlcvRuntime({} as never, { ccxtExchanges: ['binance'] }, logger, {
      refreshTargets: vi.fn().mockResolvedValue(undefined),
      leaseNextOhlcvTarget,
      syncRecentOhlcvWindow,
      deepenHistoricalOhlcvWindow,
      markOhlcvTargetSuccess: vi.fn(),
      markOhlcvTargetFailure: vi.fn(),
    });

    await runtime.tick(new Date('2026-03-23T00:00:00.000Z'));

    expect(syncRecentOhlcvWindow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ priorityTier: 'top100' }), expect.any(Date));
    expect(deepenHistoricalOhlcvWindow).not.toHaveBeenCalled();
  });

  it('deepens history only after recent coverage is current enough', async () => {
    const syncRecentOhlcvWindow = vi.fn().mockResolvedValue([]);
    const deepenHistoricalOhlcvWindow = vi.fn().mockResolvedValue([]);
    const leaseNextOhlcvTarget = vi.fn().mockReturnValue({
      coinId: 'bitcoin',
      exchangeId: 'binance',
      symbol: 'BTC/USDT',
      vsCurrency: 'usd',
      interval: '1d',
      priorityTier: 'top100',
      latestSyncedAt: new Date('2026-03-22T00:00:00.000Z'),
      oldestSyncedAt: new Date('2025-03-22T00:00:00.000Z'),
      targetHistoryDays: 365,
    });
    const runtime = createOhlcvRuntime({} as never, { ccxtExchanges: ['binance'] }, logger, {
      refreshTargets: vi.fn().mockResolvedValue(undefined),
      leaseNextOhlcvTarget,
      syncRecentOhlcvWindow,
      deepenHistoricalOhlcvWindow,
      markOhlcvTargetSuccess: vi.fn(),
      markOhlcvTargetFailure: vi.fn(),
    });

    await runtime.tick(new Date('2026-03-23T00:00:00.000Z'));

    expect(syncRecentOhlcvWindow).toHaveBeenCalledTimes(1);
    expect(deepenHistoricalOhlcvWindow).toHaveBeenCalledTimes(1);
  });

  it('continues from persisted cursors after restart', async () => {
    const syncRecentOhlcvWindow = vi.fn().mockResolvedValue([{ timestamp: Date.parse('2026-03-23T00:00:00.000Z') }]);
    const target = {
      coinId: 'bitcoin',
      exchangeId: 'binance',
      symbol: 'BTC/USDT',
      vsCurrency: 'usd',
      interval: '1d',
      priorityTier: 'top100',
      latestSyncedAt: new Date('2026-03-22T00:00:00.000Z'),
      oldestSyncedAt: new Date('2025-03-22T00:00:00.000Z'),
      targetHistoryDays: 365,
    };
    const leaseNextOhlcvTarget = vi.fn().mockReturnValue(target);

    const runtime = createOhlcvRuntime({} as never, { ccxtExchanges: ['binance'] }, logger, {
      refreshTargets: vi.fn().mockResolvedValue(undefined),
      leaseNextOhlcvTarget,
      syncRecentOhlcvWindow,
      deepenHistoricalOhlcvWindow: vi.fn().mockResolvedValue([]),
      markOhlcvTargetSuccess: vi.fn(),
      markOhlcvTargetFailure: vi.fn(),
    });

    await runtime.tick(new Date('2026-03-24T00:00:00.000Z'));

    expect(syncRecentOhlcvWindow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ latestSyncedAt: new Date('2026-03-22T00:00:00.000Z') }), expect.any(Date));
  });
});

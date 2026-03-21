import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMarketRuntime } from '../src/services/market-runtime';

async function advanceTimersBy(ms: number) {
  vi.advanceTimersByTime(ms);
  await Promise.resolve();
}

describe('market runtime', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a boot refresh immediately and schedules both background jobs', async () => {
    const runMarketRefreshOnce = vi.fn().mockResolvedValue(undefined);
    const runSearchRebuildOnce = vi.fn().mockResolvedValue(undefined);
    const runtime = createMarketRuntime({} as never, {
      ccxtExchanges: ['binance'],
      marketRefreshIntervalSeconds: 60,
      searchRebuildIntervalSeconds: 900,
    }, logger, {
      runMarketRefreshOnce,
      runSearchRebuildOnce,
    });

    await runtime.start();
    expect(runMarketRefreshOnce).toHaveBeenCalledTimes(1);
    expect(runSearchRebuildOnce).toHaveBeenCalledTimes(0);

    await advanceTimersBy(60_000);
    expect(runMarketRefreshOnce).toHaveBeenCalledTimes(2);

    await advanceTimersBy(840_000);
    expect(runSearchRebuildOnce).toHaveBeenCalledTimes(1);

    await runtime.stop();
  });

  it('does not overlap a still-running job', async () => {
    let releaseMarketJob!: () => void;
    let callCount = 0;
    const runMarketRefreshOnce = vi.fn().mockImplementation(() => {
      callCount += 1;

      if (callCount === 2) {
        return new Promise<void>((resolve) => {
          releaseMarketJob = resolve;
        });
      }

      return Promise.resolve();
    });
    const runtime = createMarketRuntime({} as never, {
      ccxtExchanges: ['binance'],
      marketRefreshIntervalSeconds: 1,
      searchRebuildIntervalSeconds: 900,
    }, logger, {
      runMarketRefreshOnce,
      runSearchRebuildOnce: vi.fn().mockResolvedValue(undefined),
    });

    await runtime.start();
    expect(runMarketRefreshOnce).toHaveBeenCalledTimes(1);

    await advanceTimersBy(1_000);
    expect(runMarketRefreshOnce).toHaveBeenCalledTimes(2);

    await advanceTimersBy(1_000);
    expect(runMarketRefreshOnce).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    releaseMarketJob();
    await runtime.stop();
  });
});

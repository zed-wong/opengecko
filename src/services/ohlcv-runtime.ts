import type { FastifyBaseLogger } from 'fastify';

import type { AppDatabase } from '../db/client';
import { buildOhlcvSyncTargets } from './ohlcv-targets';
import { deepenHistoricalOhlcvWindow, syncRecentOhlcvWindow } from './ohlcv-sync';
import {
  leaseNextOhlcvTarget,
  markOhlcvTargetFailure,
  markOhlcvTargetSuccess,
  upsertOhlcvSyncTargets,
} from './ohlcv-worker-state';

type RuntimeLogger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error' | 'debug' | 'child'>;

type OhlcvRuntimeConfig = {
  ccxtExchanges: string[];
  ohlcvRefreshIntervalSeconds?: number;
};

type OhlcvRuntimeOverrides = {
  refreshTargets?: (now: Date) => Promise<void>;
  leaseNextOhlcvTarget?: typeof leaseNextOhlcvTarget;
  syncRecentOhlcvWindow?: typeof syncRecentOhlcvWindow;
  deepenHistoricalOhlcvWindow?: typeof deepenHistoricalOhlcvWindow;
  markOhlcvTargetSuccess?: typeof markOhlcvTargetSuccess;
  markOhlcvTargetFailure?: typeof markOhlcvTargetFailure;
};

export type OhlcvRuntime = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  tick: (now?: Date) => Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isRecentCoverageCurrentEnough(latestSyncedAt: Date | null, now: Date) {
  if (!latestSyncedAt) {
    return false;
  }

  return latestSyncedAt.getTime() >= now.getTime() - DAY_MS;
}

export function createOhlcvRuntime(
  database: AppDatabase,
  config: OhlcvRuntimeConfig,
  logger: RuntimeLogger,
  overrides: OhlcvRuntimeOverrides = {},
): OhlcvRuntime {
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> | null = null;

  async function refreshTargets(now: Date) {
    if (overrides.refreshTargets) {
      await overrides.refreshTargets(now);
      return;
    }

    const targets = await buildOhlcvSyncTargets(database, config.ccxtExchanges as never);
    upsertOhlcvSyncTargets(database, targets, now);
  }

  return {
    async tick(now = new Date()) {
      if (inFlight) {
        return inFlight;
      }

      inFlight = (async () => {
        await refreshTargets(now);

        const leased = (overrides.leaseNextOhlcvTarget ?? leaseNextOhlcvTarget)(database, now);

        if (!leased) {
          return;
        }

        try {
          const recentCoverageWasCurrent = isRecentCoverageCurrentEnough(leased.latestSyncedAt, now);
          const recentCandles = await (overrides.syncRecentOhlcvWindow ?? syncRecentOhlcvWindow)(database, leased, now);
          const nextLatestSyncedAt = recentCandles.at(-1)
            ? new Date(recentCandles.at(-1)!.timestamp)
            : leased.latestSyncedAt;

          let nextOldestSyncedAt = leased.oldestSyncedAt;

          if (recentCoverageWasCurrent && isRecentCoverageCurrentEnough(nextLatestSyncedAt, now)) {
            const historicalCandles = await (overrides.deepenHistoricalOhlcvWindow ?? deepenHistoricalOhlcvWindow)(database, {
              ...leased,
              latestSyncedAt: nextLatestSyncedAt,
            }, now);

            if (historicalCandles[0]) {
              nextOldestSyncedAt = new Date(historicalCandles[0].timestamp);
            }
          }

          (overrides.markOhlcvTargetSuccess ?? markOhlcvTargetSuccess)(database, {
            coinId: leased.coinId,
            exchangeId: leased.exchangeId,
            symbol: leased.symbol,
            interval: leased.interval,
            vsCurrency: leased.vsCurrency,
            latestSyncedAt: nextLatestSyncedAt,
            oldestSyncedAt: nextOldestSyncedAt,
            completedAt: now,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          (overrides.markOhlcvTargetFailure ?? markOhlcvTargetFailure)(database, {
            coinId: leased.coinId,
            exchangeId: leased.exchangeId,
            symbol: leased.symbol,
            interval: leased.interval,
            vsCurrency: leased.vsCurrency,
            failedAt: now,
            error: message,
          });
          logger.error({ error: message, coinId: leased.coinId }, 'ohlcv runtime tick failed');
        }
      })().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
    async start() {
      await this.tick();
      timer = setInterval(() => {
        void this.tick();
      }, (config.ohlcvRefreshIntervalSeconds ?? 60) * 1000);
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      if (inFlight) {
        await inFlight;
      }
    },
  };
}

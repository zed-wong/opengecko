import type { FastifyBaseLogger } from 'fastify';

import type { AppConfig } from '../config/env';
import type { AppDatabase } from '../db/client';
import { refreshCurrencyApiRatesOnce } from './currency-rates';
import { runMarketRefreshOnce } from './market-refresh';
import { runSearchRebuildOnce } from './search-rebuild';

type RuntimeLogger = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

type JobRunner = () => Promise<void>;

function createSerializedJob(name: string, logger: RuntimeLogger, runner: JobRunner) {
  let inFlight: Promise<void> | null = null;

  return {
    run: async () => {
      if (inFlight) {
        logger.warn({ job: name }, 'background job skipped because the previous run is still active');
        return inFlight;
      }

      inFlight = (async () => {
        try {
          await runner();
          logger.info({ job: name }, 'background job completed');
        } catch (error) {
          logger.error({ job: name, error }, 'background job failed');
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    },
    waitForIdle: async () => {
      if (inFlight) {
        await inFlight;
      }
    },
  };
}

export type MarketRuntime = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type MarketRuntimeOverrides = {
  runCurrencyRefreshOnce?: JobRunner;
  runMarketRefreshOnce?: JobRunner;
  runSearchRebuildOnce?: JobRunner;
};

export function createMarketRuntime(
  database: AppDatabase,
  config: Pick<AppConfig, 'ccxtExchanges' | 'currencyRefreshIntervalSeconds' | 'marketRefreshIntervalSeconds' | 'searchRebuildIntervalSeconds'>,
  logger: RuntimeLogger,
  overrides: MarketRuntimeOverrides = {},
): MarketRuntime {
  let currencyTimer: NodeJS.Timeout | null = null;
  let marketTimer: NodeJS.Timeout | null = null;
  let searchTimer: NodeJS.Timeout | null = null;

  const runCurrencyJob = createSerializedJob('currency_refresh', logger, async () => {
    await (overrides.runCurrencyRefreshOnce ?? (() => refreshCurrencyApiRatesOnce()))();
  });
  const runMarketJob = createSerializedJob('market_refresh', logger, async () => {
    await (overrides.runMarketRefreshOnce ?? (() => runMarketRefreshOnce(database, config)))();
  });
  const runSearchJob = createSerializedJob('search_rebuild', logger, async () => {
    await (overrides.runSearchRebuildOnce ?? (() => runSearchRebuildOnce(database)))();
  });

  return {
    async start() {
      await runCurrencyJob.run();
      await runMarketJob.run();

      currencyTimer = setInterval(() => {
        void runCurrencyJob.run();
      }, config.currencyRefreshIntervalSeconds * 1000);
      marketTimer = setInterval(() => {
        void runMarketJob.run();
      }, config.marketRefreshIntervalSeconds * 1000);
      searchTimer = setInterval(() => {
        void runSearchJob.run();
      }, config.searchRebuildIntervalSeconds * 1000);
    },
    async stop() {
      if (currencyTimer) {
        clearInterval(currencyTimer);
        currencyTimer = null;
      }

      if (marketTimer) {
        clearInterval(marketTimer);
        marketTimer = null;
      }

      if (searchTimer) {
        clearInterval(searchTimer);
        searchTimer = null;
      }

      await Promise.all([runCurrencyJob.waitForIdle(), runMarketJob.waitForIdle(), runSearchJob.waitForIdle()]);
    },
  };
}

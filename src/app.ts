import Fastify, { type FastifyInstance } from 'fastify';

import { mergeConfig, type AppConfig } from './config/env';
import { createDatabase, migrateDatabase, seedStaticReferenceData, rebuildSearchIndex } from './db/client';
import { registerErrorHandler } from './http/errors';
import { registerAssetPlatformRoutes } from './modules/assets';
import { registerCoinRoutes } from './modules/coins';
import { registerDiagnosticsRoutes } from './modules/diagnostics';
import { registerExchangeRoutes } from './modules/exchanges';
import { registerGlobalRoutes } from './modules/global';
import { registerHealthRoutes } from './modules/health';
import { registerOnchainRoutes } from './modules/onchain';
import { registerSearchRoutes } from './modules/search';
import { registerSimpleRoutes } from './modules/simple';
import { registerTreasuryRoutes } from './modules/treasury';
import { createMarketRuntime } from './services/market-runtime';
import { createMarketDataRuntimeState } from './services/market-runtime-state';
import type { StartupProgressReporter } from './services/startup-progress';

export type BuildAppOptions = {
  config?: Partial<AppConfig>;
  startBackgroundJobs?: boolean;
  pluginTimeout?: number;
  startupProgress?: StartupProgressReporter;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = mergeConfig(options.config);
  const loggerOpts = config.logLevel === 'silent'
    ? false
    : {
        level: config.logLevel,
        ...(config.logPretty ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.L',
              ignore: 'pid,hostname',
            },
          },
        } : {}),
      };

  const app = Fastify({
    logger: loggerOpts,
    ...(options.pluginTimeout ? { pluginTimeout: options.pluginTimeout } : {}),
  });
  options.startupProgress?.begin('connect_database');
  const database = createDatabase(config.databaseUrl);
  const shouldStartBackgroundJobs = options.startBackgroundJobs ?? false;
  const marketDataRuntimeState = createMarketDataRuntimeState();
  const runtime = shouldStartBackgroundJobs
    ? createMarketRuntime(database, config, app.log, marketDataRuntimeState, {}, options.startupProgress)
    : null;

  migrateDatabase(database);
  options.startupProgress?.complete('connect_database');

  registerErrorHandler(app);
  registerHealthRoutes(app);
  registerDiagnosticsRoutes(app, database);
  registerSimpleRoutes(app, database, config.marketFreshnessThresholdSeconds, marketDataRuntimeState);
  registerAssetPlatformRoutes(app, database);
  registerCoinRoutes(app, database, config.marketFreshnessThresholdSeconds, marketDataRuntimeState);
  registerExchangeRoutes(app, database, config.marketFreshnessThresholdSeconds, marketDataRuntimeState);
  registerTreasuryRoutes(app, database);
  registerOnchainRoutes(app, database);
  registerSearchRoutes(app, database);
  registerGlobalRoutes(app, database, config.marketFreshnessThresholdSeconds, marketDataRuntimeState);

  app.addHook('onReady', async () => {
    // Always run initial market sync (live data from CCXT)
    if (runtime) {
      await runtime.start();
    } else {
      const { runInitialMarketSync } = await import('./services/initial-sync');
      await runInitialMarketSync(database, config, undefined, {
        onStepChange: (stepId) => {
          options.startupProgress?.begin(stepId);
        },
        onOhlcvBackfillProgress: (current, total) => {
          options.startupProgress?.updateOhlcvProgress(current, total);
        },
      });
      marketDataRuntimeState.initialSyncCompleted = true;

      // Seed static reference data (treasury, derivatives, onchain) after coins exist
      options.startupProgress?.begin('seed_reference_data');
      seedStaticReferenceData(database);
      options.startupProgress?.complete('seed_reference_data');
      options.startupProgress?.begin('rebuild_search_index');
      rebuildSearchIndex(database);
      options.startupProgress?.complete('rebuild_search_index');
      options.startupProgress?.begin('start_http_listener');
    }
  });

  app.addHook('onClose', async () => {
    if (runtime) {
      await runtime.stop();
    }

    database.client.close();
  });

  return app;
}

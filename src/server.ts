import { buildApp } from './app';
import { loadConfig } from './config/env';
import { detectSqliteRuntime } from './db/client';
import { createStartupProgressTracker } from './services/startup-progress';

async function start() {
  const startupProgress = createStartupProgressTracker();

  try {
    const config = loadConfig();
    startupProgress.start({
      runtime: detectSqliteRuntime(),
      driver: 'better-sqlite3',
      databaseUrl: config.databaseUrl,
    });
    startupProgress.complete('load_config');
    const app = buildApp({
      config,
      startBackgroundJobs: true,
      pluginTimeout: 0,
      startupPluginTimeout: 110_000,
      startupProgress,
    });

    await app.listen({
      host: config.host,
      port: config.port,
    });
    app.marketRuntime?.markListenerBound();
    app.marketDataRuntimeState.listenerBound = true;
    startupProgress.complete('start_http_listener');
    startupProgress.finish(config.port);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    startupProgress.failCurrent(message);
    console.error(error);
    process.exit(1);
  }
}

void start();

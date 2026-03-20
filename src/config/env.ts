import { z } from 'zod';

import {
  DEFAULT_CCXT_EXCHANGES,
  DEFAULT_MARKET_FRESHNESS_THRESHOLD_SECONDS,
  DEFAULT_MARKET_REFRESH_INTERVAL_SECONDS,
  DEFAULT_SEARCH_REBUILD_INTERVAL_SECONDS,
} from './runtime-policy';

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().default('./data/opengecko.db'),
  CCXT_EXCHANGES: z.string().default(DEFAULT_CCXT_EXCHANGES.join(',')),
  MARKET_FRESHNESS_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(DEFAULT_MARKET_FRESHNESS_THRESHOLD_SECONDS),
  MARKET_REFRESH_INTERVAL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_MARKET_REFRESH_INTERVAL_SECONDS),
  SEARCH_REBUILD_INTERVAL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_SEARCH_REBUILD_INTERVAL_SECONDS),
});

export type AppConfig = {
  host: string;
  port: number;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  databaseUrl: string;
  ccxtExchanges: string[];
  marketFreshnessThresholdSeconds: number;
  marketRefreshIntervalSeconds: number;
  searchRebuildIntervalSeconds: number;
};

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = envSchema.parse(rawEnv);

  return {
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    ccxtExchanges: env.CCXT_EXCHANGES.split(',').map((value) => value.trim()).filter(Boolean),
    marketFreshnessThresholdSeconds: env.MARKET_FRESHNESS_THRESHOLD_SECONDS,
    marketRefreshIntervalSeconds: env.MARKET_REFRESH_INTERVAL_SECONDS,
    searchRebuildIntervalSeconds: env.SEARCH_REBUILD_INTERVAL_SECONDS,
  };
}

export function mergeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig(),
    ...overrides,
  };
}

import type { AppConfig } from '../config/env';
import type { AppDatabase } from '../db/client';
import { exchanges, ohlcvCandles } from '../db/schema';
import type { Logger } from 'pino';
import { createLogger } from '../lib/logger';
import { fetchExchangeMarkets, fetchExchangeOHLCV, isValidExchangeId, type ExchangeId } from '../providers/ccxt';
import { syncCoinCatalogFromExchanges } from './coin-catalog-sync';
import { syncChainCatalogFromExchanges } from './chain-catalog-sync';
import { runMarketRefreshOnce } from './market-refresh';
import { upsertCanonicalOhlcvCandle } from './candle-store';
import { buildOhlcvSyncTargets } from './ohlcv-targets';

export type InitialSyncProgressHandlers = {
  onStepChange?: (stepId: 'sync_exchange_metadata' | 'sync_coin_catalog' | 'sync_chain_catalog' | 'build_market_snapshots' | 'backfill_ohlcv') => void;
  onOhlcvBackfillProgress?: (current: number, total: number) => void;
};

export async function syncExchangesFromCCXT(
  database: AppDatabase,
  exchangeIds: ExchangeId[],
  logger: Logger,
) {
  for (const exchangeId of exchangeIds) {
    const exchangeLogger = logger.child({ exchange: exchangeId });
    try {
      const markets = await fetchExchangeMarkets(exchangeId);
      exchangeLogger.debug({ marketCount: markets.length }, 'fetched exchange markets');

      if (markets.length === 0) {
        continue;
      }

      // Use exchange ID directly - CCXT provides the canonical ID
      database.db
        .insert(exchanges)
        .values({
          id: exchangeId,
          name: exchangeId.charAt(0).toUpperCase() + exchangeId.slice(1),
          description: '',
          url: `https://www.${exchangeId}.com`,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: exchanges.id,
          set: {
            updatedAt: new Date(),
          },
        })
        .run();
    } catch (error) {
      const errorInfo = error instanceof Error ? { message: error.message } : { message: String(error) };
      exchangeLogger.warn(errorInfo, 'exchange metadata sync failed');
    }
  }
}

export async function runOhlcvBackfill(
  database: AppDatabase,
  exchangeIds: ExchangeId[],
  lookbackDays: number,
  logger: Logger,
  progress?: Pick<InitialSyncProgressHandlers, 'onOhlcvBackfillProgress'>,
) {
  const backfillLogger = logger.child({ operation: 'ohlcv_backfill', lookbackDays });
  const startTime = Date.now();
  const validExchanges = exchangeIds.filter(isValidExchangeId);
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const targets = await buildOhlcvSyncTargets(database, validExchanges);
  progress?.onOhlcvBackfillProgress?.(0, targets.length);

  backfillLogger.info({ exchangeCount: validExchanges.length, targetCount: targets.length }, 'starting ohlcv backfill');

  let candlesWritten = 0;
  let failures = 0;
  let processedTargets = 0;

  for (const target of targets) {
    try {
      const candles = await fetchExchangeOHLCV(target.exchangeId, target.symbol, '1d', since);

      for (const candle of candles) {
        upsertCanonicalOhlcvCandle(database, {
          coinId: target.coinId,
          vsCurrency: 'usd',
          interval: '1d',
          timestamp: new Date(candle.timestamp),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          totalVolume: candle.volume,
          replaceExisting: true,
        });
        candlesWritten += 1;
      }
    } catch (error) {
      failures += 1;
      const errorInfo = error instanceof Error ? { message: error.message } : { message: String(error) };
      backfillLogger.warn({ coinId: target.coinId, exchange: target.exchangeId, symbol: target.symbol, ...errorInfo }, 'backfill failed for coin');
    } finally {
      processedTargets += 1;
      progress?.onOhlcvBackfillProgress?.(processedTargets, targets.length);
    }
  }

  const durationMs = Date.now() - startTime;
  backfillLogger.info({ candlesWritten, failures, targetCount: targets.length, durationMs }, 'ohlcv backfill complete');

  return candlesWritten;
}

export type InitialSyncResult = {
  coinsDiscovered: number;
  chainsDiscovered: number;
  snapshotsCreated: number;
  tickersWritten: number;
  exchangesSynced: number;
  ohlcvCandlesWritten: number;
};

export async function runInitialMarketSync(
  database: AppDatabase,
  config: Pick<AppConfig, 'ccxtExchanges' | 'marketFreshnessThresholdSeconds'>,
  logger?: Logger,
  progress?: InitialSyncProgressHandlers,
): Promise<InitialSyncResult> {
  const syncLogger = logger?.child({ operation: 'initial_sync' }) ?? createLogger({ level: 'info' }).child({ operation: 'initial_sync' });
  const startTime = Date.now();
  const exchangeIds = config.ccxtExchanges.filter(isValidExchangeId);

  syncLogger.info({ exchanges: exchangeIds }, 'starting initial market sync');

  // Step 1: Sync exchanges first (required for coin_tickers FK)
  progress?.onStepChange?.('sync_exchange_metadata');
  syncLogger.debug('syncing exchange metadata');
  await syncExchangesFromCCXT(database, exchangeIds, syncLogger);

  // Step 2: Discover coins from all exchanges
  progress?.onStepChange?.('sync_coin_catalog');
  syncLogger.debug('discovering coins from exchanges');
  const { insertedOrUpdated: coinsDiscovered } = await syncCoinCatalogFromExchanges(database, exchangeIds, syncLogger);
  syncLogger.info({ coinsDiscovered }, 'coin catalog sync complete');

  // Step 2.5: Discover chains/networks from all exchanges
  progress?.onStepChange?.('sync_chain_catalog');
  syncLogger.debug('discovering chains from exchanges');
  const { insertedOrUpdated: chainsDiscovered } = await syncChainCatalogFromExchanges(database, exchangeIds, syncLogger);
  syncLogger.info({ chainsDiscovered }, 'chain catalog sync complete');

  // Step 3: Fetch tickers and build market snapshots + coin tickers
  progress?.onStepChange?.('build_market_snapshots');
  syncLogger.debug('running market refresh');
  await runMarketRefreshOnce(database, { ccxtExchanges: exchangeIds }, syncLogger);

  // Step 4: Count live snapshots
  const { count } = await import('drizzle-orm');
  const { marketSnapshots } = await import('../db/schema');
  const [{ value: snapshotCount }] = database.db
    .select({ value: count() })
    .from(marketSnapshots)
    .all();

  // Step 5: OHLCV backfill
  progress?.onStepChange?.('backfill_ohlcv');
  const hasExistingCandles = database.db
    .select({ id: ohlcvCandles.coinId })
    .from(ohlcvCandles)
    .limit(1)
    .all()
    .length > 0;

  const lookbackDays = hasExistingCandles ? 30 : 365;
  const ohlcvCandlesWritten = await runOhlcvBackfill(database, exchangeIds, lookbackDays, syncLogger, progress);

  const durationMs = Date.now() - startTime;
  syncLogger.info({
    coinsDiscovered,
    chainsDiscovered,
    snapshotsCreated: snapshotCount,
    ohlcvCandlesWritten,
    exchangesSynced: exchangeIds.length,
    durationMs,
  }, 'initial market sync complete');

  return {
    coinsDiscovered,
    chainsDiscovered,
    snapshotsCreated: snapshotCount,
    tickersWritten: snapshotCount,
    exchangesSynced: exchangeIds.length,
    ohlcvCandlesWritten,
  };
}

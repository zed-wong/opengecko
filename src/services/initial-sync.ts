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

const USD_QUOTE_PRIORITY = ['USDT', 'USD'] as const;

type BackfillTarget = {
  coinId: string;
  symbol: string;
  exchangeId: ExchangeId;
};

async function buildBackfillTargets(
  database: AppDatabase,
  enabledExchanges: ExchangeId[],
  logger: Logger,
) {
  const marketIndex = new Map<ExchangeId, Set<string>>();
  const startTime = Date.now();

  for (const exchangeId of enabledExchanges) {
    try {
      const markets = await fetchExchangeMarkets(exchangeId);
      const supportedSymbols = new Set(
        markets
          .filter((market) => market.active && market.spot)
          .map((market) => market.symbol),
      );
      marketIndex.set(exchangeId, supportedSymbols);
    } catch (error) {
      logger.warn({ exchange: exchangeId, error }, 'failed to fetch markets for backfill');
    }
  }

  const { coins } = await import('../db/schema');
  const targets: BackfillTarget[] = [];
  const rows = database.db.select({ id: coins.id, symbol: coins.symbol }).from(coins).all();

  for (const row of rows) {
    const base = row.symbol.toUpperCase();
    let selectedTarget: BackfillTarget | null = null;

    // Try each exchange until we find a matching market
    for (const exchangeId of enabledExchanges) {
      const supportedSymbols = marketIndex.get(exchangeId);
      if (!supportedSymbols) continue;

      const matchedQuote = USD_QUOTE_PRIORITY.find((quote) => supportedSymbols.has(`${base}/${quote}`));
      if (matchedQuote) {
        selectedTarget = {
          coinId: row.id,
          exchangeId,
          symbol: `${base}/${matchedQuote}`,
        };
        break;
      }
    }

    if (selectedTarget) {
      targets.push(selectedTarget);
    }
  }

  logger.debug({ targetCount: targets.length, durationMs: Date.now() - startTime }, 'built backfill targets');

  return targets;
}

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
) {
  const backfillLogger = logger.child({ operation: 'ohlcv_backfill', lookbackDays });
  const startTime = Date.now();
  const validExchanges = exchangeIds.filter(isValidExchangeId);
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const targets = await buildBackfillTargets(database, validExchanges, backfillLogger);

  backfillLogger.info({ exchangeCount: validExchanges.length, targetCount: targets.length }, 'starting ohlcv backfill');

  let candlesWritten = 0;
  let failures = 0;

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
): Promise<InitialSyncResult> {
  const syncLogger = logger?.child({ operation: 'initial_sync' }) ?? createLogger({ level: 'info' }).child({ operation: 'initial_sync' });
  const startTime = Date.now();
  const exchangeIds = config.ccxtExchanges.filter(isValidExchangeId);

  syncLogger.info({ exchanges: exchangeIds }, 'starting initial market sync');

  // Step 1: Sync exchanges first (required for coin_tickers FK)
  syncLogger.debug('syncing exchange metadata');
  await syncExchangesFromCCXT(database, exchangeIds, syncLogger);

  // Step 2: Discover coins from all exchanges
  syncLogger.debug('discovering coins from exchanges');
  const { insertedOrUpdated: coinsDiscovered } = await syncCoinCatalogFromExchanges(database, exchangeIds, syncLogger);
  syncLogger.info({ coinsDiscovered }, 'coin catalog sync complete');

  // Step 2.5: Discover chains/networks from all exchanges
  syncLogger.debug('discovering chains from exchanges');
  const { insertedOrUpdated: chainsDiscovered } = await syncChainCatalogFromExchanges(database, exchangeIds, syncLogger);
  syncLogger.info({ chainsDiscovered }, 'chain catalog sync complete');

  // Step 3: Fetch tickers and build market snapshots + coin tickers
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
  const hasExistingCandles = database.db
    .select({ id: ohlcvCandles.coinId })
    .from(ohlcvCandles)
    .limit(1)
    .all()
    .length > 0;

  const lookbackDays = hasExistingCandles ? 30 : 365;
  const ohlcvCandlesWritten = await runOhlcvBackfill(database, exchangeIds, lookbackDays, syncLogger);

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

import type { AppConfig } from '../config/env';
import type { AppDatabase } from '../db/client';
import { exchanges, ohlcvCandles } from '../db/schema';
import { fetchExchangeMarkets, fetchExchangeOHLCV, isSupportedExchangeId, type SupportedExchangeId } from '../providers/ccxt';
import { syncCoinCatalogFromExchanges } from './coin-catalog-sync';
import { syncChainCatalogFromExchanges } from './chain-catalog-sync';
import { runMarketRefreshOnce } from './market-refresh';
import { upsertCanonicalOhlcvCandle, toDailyBucket } from './candle-store';

const SUPPORTED_EXCHANGES: SupportedExchangeId[] = ['binance', 'coinbase', 'kraken'];
const BACKFILL_EXCHANGE_PRIORITY: SupportedExchangeId[] = ['binance', 'coinbase', 'kraken'];
const USD_QUOTE_PRIORITY = ['USDT', 'USD'] as const;

type BackfillTarget = {
  coinId: string;
  symbol: string;
  exchangeId: SupportedExchangeId;
};

async function buildBackfillTargets(
  database: AppDatabase,
  enabledExchanges: Set<SupportedExchangeId>,
) {
  const marketIndex = new Map<SupportedExchangeId, Set<string>>();

  for (const exchangeId of BACKFILL_EXCHANGE_PRIORITY) {
    if (!enabledExchanges.has(exchangeId)) {
      continue;
    }

    const markets = await fetchExchangeMarkets(exchangeId);
    const supportedSymbols = new Set(
      markets
        .filter((market) => market.active && market.spot)
        .map((market) => market.symbol),
    );

    marketIndex.set(exchangeId, supportedSymbols);
  }

  const { coins } = await import('../db/schema');
  const targets: BackfillTarget[] = [];
  const rows = database.db.select({ id: coins.id, symbol: coins.symbol }).from(coins).all();

  for (const row of rows) {
    const base = row.symbol.toUpperCase();
    let selectedTarget: BackfillTarget | null = null;

    for (const exchangeId of BACKFILL_EXCHANGE_PRIORITY) {
      const supportedSymbols = marketIndex.get(exchangeId);

      if (!supportedSymbols) {
        continue;
      }

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

  return targets;
}

export async function syncExchangesFromCCXT(
  database: AppDatabase,
  exchangeIds: SupportedExchangeId[],
) {
  const exchangeIdMap: Record<SupportedExchangeId, string> = {
    binance: 'binance',
    coinbase: 'coinbase_exchange',
    kraken: 'kraken',
  };

  const exchangeNames: Record<SupportedExchangeId, string> = {
    binance: 'Binance',
    coinbase: 'Coinbase Exchange',
    kraken: 'Kraken',
  };

  const exchangeUrls: Record<SupportedExchangeId, string> = {
    binance: 'https://www.binance.com',
    coinbase: 'https://exchange.coinbase.com',
    kraken: 'https://www.kraken.com',
  };

  for (const exchangeId of exchangeIds) {
    try {
      const markets = await fetchExchangeMarkets(exchangeId);

      if (markets.length === 0) {
        continue;
      }

      database.db
        .insert(exchanges)
        .values({
          id: exchangeIdMap[exchangeId],
          name: exchangeNames[exchangeId],
          description: '',
          url: exchangeUrls[exchangeId],
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .run();
    } catch {
      // Exchange metadata sync failed — non-critical, continue
    }
  }
}

export async function runOhlcvBackfill(
  database: AppDatabase,
  exchangeIds: SupportedExchangeId[],
  lookbackDays: number,
) {
  const enabledExchanges = new Set(exchangeIds.filter(isSupportedExchangeId));
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const targets = await buildBackfillTargets(database, enabledExchanges);

  let candlesWritten = 0;

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
    } catch {
      // Single coin backfill failed — continue with other coins
    }
  }

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
): Promise<InitialSyncResult> {
  const exchangeIds = config.ccxtExchanges.filter(isSupportedExchangeId);

  // Step 1: Sync exchanges first (required for coin_tickers FK)
  await syncExchangesFromCCXT(database, exchangeIds);

  // Step 2: Discover coins from all exchanges
  const { insertedOrUpdated: coinsDiscovered } = await syncCoinCatalogFromExchanges(database, exchangeIds);

  // Step 2.5: Discover chains/networks from all exchanges
  const { insertedOrUpdated: chainsDiscovered } = await syncChainCatalogFromExchanges(database, exchangeIds);

  // Step 3: Fetch tickers and build market snapshots + coin tickers
  await runMarketRefreshOnce(database, { ccxtExchanges: exchangeIds });

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
  const ohlcvCandlesWritten = await runOhlcvBackfill(database, exchangeIds, lookbackDays);

  return {
    coinsDiscovered,
    chainsDiscovered,
    snapshotsCreated: snapshotCount,
    tickersWritten: snapshotCount,
    exchangesSynced: exchangeIds.length,
    ohlcvCandlesWritten,
  };
}

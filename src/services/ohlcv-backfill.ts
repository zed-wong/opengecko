import type { AppConfig } from '../config/env';
import type { AppDatabase } from '../db/client';
import { fetchExchangeMarkets, fetchExchangeOHLCV, isValidExchangeId, type ExchangeId } from '../providers/ccxt';
import { upsertCanonicalOhlcvCandle } from './candle-store';
import { syncCoinCatalogFromExchanges } from './coin-catalog-sync';
import { buildOhlcvSyncTargets } from './ohlcv-targets';

export async function runOhlcvBackfillOnce(
  database: AppDatabase,
  config: Pick<AppConfig, 'ccxtExchanges'>,
  options: { lookbackDays?: number } = {},
) {
  const enabledExchanges = config.ccxtExchanges.filter(isValidExchangeId);
  const lookbackDays = options.lookbackDays ?? 365;
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  await syncCoinCatalogFromExchanges(database, enabledExchanges);
  const targets = await buildOhlcvSyncTargets(database, enabledExchanges);

  for (const target of targets) {
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
    }
  }
}

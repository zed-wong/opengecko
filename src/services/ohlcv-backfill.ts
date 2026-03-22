import type { AppConfig } from '../config/env';
import type { AppDatabase } from '../db/client';
import { coins } from '../db/schema';
import { fetchExchangeMarkets, fetchExchangeOHLCV, isValidExchangeId, type ExchangeId } from '../providers/ccxt';
import { upsertCanonicalOhlcvCandle } from './candle-store';
import { syncCoinCatalogFromExchanges } from './coin-catalog-sync';

const USD_QUOTE_PRIORITY = ['USDT', 'USD'] as const;

type BackfillTarget = {
  coinId: string;
  symbol: string;
  exchangeId: ExchangeId;
};

async function buildBackfillTargets(
  database: AppDatabase,
  enabledExchanges: ExchangeId[],
) {
  const marketIndex = new Map<ExchangeId, Set<string>>();

  for (const exchangeId of enabledExchanges) {
    const markets = await fetchExchangeMarkets(exchangeId);
    const supportedSymbols = new Set(
      markets
        .filter((market) => market.active && market.spot)
        .map((market) => market.symbol),
    );

    marketIndex.set(exchangeId, supportedSymbols);
  }

  const targets: BackfillTarget[] = [];
  const rows = database.db.select({ id: coins.id, symbol: coins.symbol }).from(coins).all();

  for (const row of rows) {
    const base = row.symbol.toUpperCase();
    let selectedTarget: BackfillTarget | null = null;

    for (const exchangeId of enabledExchanges) {
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

export async function runOhlcvBackfillOnce(
  database: AppDatabase,
  config: Pick<AppConfig, 'ccxtExchanges'>,
  options: { lookbackDays?: number } = {},
) {
  const enabledExchanges = config.ccxtExchanges.filter(isValidExchangeId);
  const lookbackDays = options.lookbackDays ?? 365;
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  await syncCoinCatalogFromExchanges(database, enabledExchanges);
  const targets = await buildBackfillTargets(database, enabledExchanges);

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

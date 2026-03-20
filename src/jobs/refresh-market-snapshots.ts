import { and, eq } from 'drizzle-orm';

import { loadConfig } from '../config/env';
import { createDatabase, initializeDatabase } from '../db/client';
import { marketSnapshots } from '../db/schema';
import { fetchExchangeTickers, type SupportedExchangeId } from '../providers/ccxt';
import { buildLiveSnapshotValue, createMarketQuoteAccumulator, type MarketQuoteAccumulator } from '../services/market-snapshots';

const SUPPORTED_EXCHANGES: SupportedExchangeId[] = ['binance', 'coinbase', 'kraken'];

const COIN_SYMBOL_CANDIDATES = {
  bitcoin: ['BTC/USD', 'BTC/USDT'],
  ethereum: ['ETH/USD', 'ETH/USDT'],
  'usd-coin': ['USDC/USD', 'USDC/USDT'],
} satisfies Record<string, string[]>;

function isSupportedExchangeId(value: string): value is SupportedExchangeId {
  return SUPPORTED_EXCHANGES.includes(value as SupportedExchangeId);
}

async function refreshMarketSnapshots() {
  const config = loadConfig();
  const database = createDatabase(config.databaseUrl);

  try {
    initializeDatabase(database);

    const exchangeIds = config.ccxtExchanges.filter(isSupportedExchangeId);
    const requestedSymbols = [...new Set(Object.values(COIN_SYMBOL_CANDIDATES).flat())];
    const accumulators = new Map<string, MarketQuoteAccumulator>();

    for (const exchangeId of exchangeIds) {
      const tickers = await fetchExchangeTickers(exchangeId, requestedSymbols);

      for (const ticker of tickers) {
        const coinId = Object.entries(COIN_SYMBOL_CANDIDATES).find(([, symbols]) => symbols.includes(ticker.symbol))?.[0];

        if (!coinId || ticker.last === null) {
          continue;
        }

        const accumulator = accumulators.get(coinId) ?? createMarketQuoteAccumulator();
        accumulator.priceTotal += ticker.last;
        accumulator.priceCount += 1;

        if (ticker.quoteVolume !== null) {
          accumulator.volumeTotal += ticker.quoteVolume;
          accumulator.volumeCount += 1;
        }

        if (ticker.percentage !== null) {
          accumulator.changeTotal += ticker.percentage;
          accumulator.changeCount += 1;
        }

        if (ticker.timestamp !== null) {
          accumulator.latestTimestamp = Math.max(accumulator.latestTimestamp, ticker.timestamp);
        }

        accumulator.providers.add(exchangeId);

        accumulators.set(coinId, accumulator);
      }
    }

    const now = new Date();

    for (const [coinId, accumulator] of accumulators.entries()) {
      if (accumulator.priceCount === 0) {
        continue;
      }

      const existingSnapshot = database.db
        .select()
        .from(marketSnapshots)
        .where(and(eq(marketSnapshots.coinId, coinId), eq(marketSnapshots.vsCurrency, 'usd')))
        .limit(1)
        .get();
      const nextSnapshot = buildLiveSnapshotValue(coinId, accumulator, existingSnapshot, now);

      database.db
        .insert(marketSnapshots)
        .values(nextSnapshot)
        .onConflictDoUpdate({
          target: [marketSnapshots.coinId, marketSnapshots.vsCurrency],
          set: {
            price: nextSnapshot.price,
            marketCap: nextSnapshot.marketCap,
            totalVolume: nextSnapshot.totalVolume,
            marketCapRank: nextSnapshot.marketCapRank,
            fullyDilutedValuation: nextSnapshot.fullyDilutedValuation,
            circulatingSupply: nextSnapshot.circulatingSupply,
            totalSupply: nextSnapshot.totalSupply,
            maxSupply: nextSnapshot.maxSupply,
            ath: nextSnapshot.ath,
            athChangePercentage: nextSnapshot.athChangePercentage,
            athDate: nextSnapshot.athDate,
            atl: nextSnapshot.atl,
            atlChangePercentage: nextSnapshot.atlChangePercentage,
            atlDate: nextSnapshot.atlDate,
            priceChange24h: nextSnapshot.priceChange24h,
            priceChangePercentage24h: nextSnapshot.priceChangePercentage24h,
            sourceProvidersJson: nextSnapshot.sourceProvidersJson,
            sourceCount: nextSnapshot.sourceCount,
            updatedAt: nextSnapshot.updatedAt,
            lastUpdated: nextSnapshot.lastUpdated,
          },
        })
        .run();
    }
  } finally {
    database.client.close();
  }
}

void refreshMarketSnapshots();

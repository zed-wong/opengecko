import { coins } from '../db/schema';
import type { AppDatabase } from '../db/client';
import { buildCoinId, buildCoinName } from '../lib/coin-id';
import { fetchExchangeMarkets } from '../providers/ccxt';

const CATALOG_BASELINE_QUOTES = new Set(['USD', 'USDT', 'EUR']);

export async function syncCoinCatalogWithBinance(database: AppDatabase) {
  const markets = await fetchExchangeMarkets('binance');
  const existingCoinsById = new Map(database.db.select().from(coins).all().map((coin) => [coin.id, coin]));
  const now = new Date();
  const discoveredCoins = new Map<string, typeof coins.$inferInsert>();

  for (const market of markets) {
    if (!market.active || !market.spot || !CATALOG_BASELINE_QUOTES.has(market.quote)) {
      continue;
    }

    const coinId = buildCoinId(market.base, market.baseName);
    const existingCoin = existingCoinsById.get(coinId);

    if (existingCoin && existingCoin.symbol.toLowerCase() !== market.base.toLowerCase()) {
      continue;
    }

    if (discoveredCoins.has(coinId)) {
      continue;
    }

    discoveredCoins.set(coinId, {
      id: coinId,
      symbol: market.base.toLowerCase(),
      name: buildCoinName(market.base, market.baseName),
      apiSymbol: coinId,
      hashingAlgorithm: existingCoin?.hashingAlgorithm ?? null,
      blockTimeInMinutes: existingCoin?.blockTimeInMinutes ?? null,
      categoriesJson: existingCoin?.categoriesJson ?? '[]',
      descriptionJson: existingCoin?.descriptionJson ?? JSON.stringify({
        en: market.baseName ? `${market.baseName} imported from Binance market discovery.` : `${market.base} imported from Binance market discovery.`,
      }),
      linksJson: existingCoin?.linksJson ?? '{}',
      imageThumbUrl: existingCoin?.imageThumbUrl ?? null,
      imageSmallUrl: existingCoin?.imageSmallUrl ?? null,
      imageLargeUrl: existingCoin?.imageLargeUrl ?? null,
      marketCapRank: existingCoin?.marketCapRank ?? null,
      genesisDate: existingCoin?.genesisDate ?? null,
      platformsJson: existingCoin?.platformsJson ?? '{}',
      status: existingCoin?.status ?? 'active',
      createdAt: existingCoin?.createdAt ?? now,
      updatedAt: now,
    });
  }

  if (discoveredCoins.size === 0) {
    return { insertedOrUpdated: 0 };
  }

  const values = [...discoveredCoins.values()];

  for (const value of values) {
    database.db
      .insert(coins)
      .values(value)
      .onConflictDoUpdate({
        target: coins.id,
        set: {
          symbol: value.symbol,
          name: value.name,
          apiSymbol: value.apiSymbol,
          descriptionJson: value.descriptionJson,
          updatedAt: value.updatedAt,
          status: value.status,
        },
      })
      .run();
  }

  return {
    insertedOrUpdated: values.length,
  };
}

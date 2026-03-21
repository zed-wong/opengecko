import { and, asc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../db/client';
import { categories, coins, marketSnapshots } from '../db/schema';
import { getCanonicalCloseSeries } from '../services/candle-store';

export function parseJsonObject<T extends Record<string, unknown>>(value: string): T {
  return JSON.parse(value) as T;
}

export function parseJsonArray<T>(value: string): T[] {
  return JSON.parse(value) as T[];
}

type CoinFilters = {
  ids?: string[];
  names?: string[];
  symbols?: string[];
  status?: 'active' | 'inactive' | 'all';
};

function matchesFilters(
  filters: CoinFilters,
  coin: {
    id: string;
    name: string;
    symbol: string;
  },
) {
  if (filters.ids?.length) {
    return filters.ids.includes(coin.id);
  }

  if (filters.names?.length) {
    return filters.names.includes(coin.name.toLowerCase());
  }

  if (filters.symbols?.length) {
    return filters.symbols.includes(coin.symbol.toLowerCase());
  }

  return true;
}

export function getCoins(database: AppDatabase, filters: CoinFilters = {}) {
  const status = filters.status ?? 'active';
  const rows = status === 'all'
    ? database.db.select().from(coins).orderBy(asc(coins.id)).all()
    : database.db.select().from(coins).where(eq(coins.status, status)).orderBy(asc(coins.id)).all();

  return rows.filter((row) => matchesFilters(filters, row));
}

export function getCoinById(database: AppDatabase, id: string) {
  return database.db.select().from(coins).where(eq(coins.id, id)).limit(1).get();
}

export function getCoinByContract(database: AppDatabase, platformId: string, contractAddress: string) {
  const normalizedContract = contractAddress.toLowerCase();

  return getCoins(database, { status: 'all' }).find((coin) => {
    const platforms = parseJsonObject<Record<string, string>>(coin.platformsJson);

    return platforms[platformId]?.toLowerCase() === normalizedContract;
  });
}

export function getMarketRows(database: AppDatabase, vsCurrency: string, filters: CoinFilters = {}) {
  const joinedRows = database.db
    .select()
    .from(coins)
    .leftJoin(
      marketSnapshots,
      and(eq(marketSnapshots.coinId, coins.id), eq(marketSnapshots.vsCurrency, vsCurrency)),
    )
    .orderBy(asc(coins.marketCapRank), asc(coins.id))
    .all();

  return joinedRows
    .filter(({ coins: coin }) => {
      if (!coin) {
        return false;
      }

      if (filters.status && filters.status !== 'all' && coin.status !== filters.status) {
        return false;
      }

      return matchesFilters(filters, coin);
    })
    .map((row) => ({
      coin: row.coins,
      snapshot: row.market_snapshots,
    }))
    .filter((row): row is { coin: NonNullable<typeof row.coin>; snapshot: typeof row.snapshot } => Boolean(row.coin));
}

export function getCategories(database: AppDatabase) {
  return database.db.select().from(categories).orderBy(asc(categories.name)).all();
}

export function getChartSeries(
  database: AppDatabase,
  coinId: string,
  vsCurrency: string,
  range?: { from?: number; to?: number },
) {
  return getCanonicalCloseSeries(database, coinId, vsCurrency, '1d', range);
}

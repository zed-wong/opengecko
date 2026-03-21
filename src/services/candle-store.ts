import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import type { AppDatabase } from '../db/client';
import { ohlcvCandles, quoteSnapshots, type OhlcvCandleRow } from '../db/schema';

export type CandleInterval = '1m' | '1d';

export type CanonicalCandleInput = {
  coinId: string;
  vsCurrency: string;
  interval: CandleInterval;
  timestamp: Date;
  price: number;
  volume?: number | null;
  marketCap?: number | null;
  totalVolume?: number | null;
  source?: string;
};

export type CanonicalOhlcvCandleInput = {
  coinId: string;
  vsCurrency: string;
  interval: CandleInterval;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  marketCap?: number | null;
  totalVolume?: number | null;
  source?: string;
  replaceExisting?: boolean;
};

export type QuoteSnapshotInput = {
  coinId: string;
  vsCurrency: string;
  exchangeId: string;
  symbol: string;
  fetchedAt: Date;
  price: number;
  quoteVolume?: number | null;
  priceChangePercentage24h?: number | null;
  sourcePayloadJson: string;
};

function buildRangeWhere(
  coinId: string,
  vsCurrency: string,
  interval: CandleInterval,
  range?: { from?: number; to?: number },
) {
  const baseCondition = and(
    eq(ohlcvCandles.coinId, coinId),
    eq(ohlcvCandles.vsCurrency, vsCurrency),
    eq(ohlcvCandles.interval, interval),
    eq(ohlcvCandles.source, 'canonical'),
  );

  if (range?.from !== undefined && range?.to !== undefined) {
    return and(baseCondition, gte(ohlcvCandles.timestamp, new Date(range.from)), lte(ohlcvCandles.timestamp, new Date(range.to)));
  }

  if (range?.from !== undefined) {
    return and(baseCondition, gte(ohlcvCandles.timestamp, new Date(range.from)));
  }

  if (range?.to !== undefined) {
    return and(baseCondition, lte(ohlcvCandles.timestamp, new Date(range.to)));
  }

  return baseCondition;
}

export function getCanonicalCandles(
  database: AppDatabase,
  coinId: string,
  vsCurrency: string,
  interval: CandleInterval,
  range?: { from?: number; to?: number },
) {
  return database.db
    .select()
    .from(ohlcvCandles)
    .where(buildRangeWhere(coinId, vsCurrency, interval, range))
    .orderBy(asc(ohlcvCandles.timestamp))
    .all();
}

export function getCanonicalCloseSeries(
  database: AppDatabase,
  coinId: string,
  vsCurrency: string,
  interval: CandleInterval,
  range?: { from?: number; to?: number },
) {
  return getCanonicalCandles(database, coinId, vsCurrency, interval, range).map((row) => ({
    timestamp: row.timestamp,
    price: row.close,
    marketCap: row.marketCap,
    totalVolume: row.totalVolume,
  }));
}

export function recordQuoteSnapshot(database: AppDatabase, input: QuoteSnapshotInput) {
  database.db
    .insert(quoteSnapshots)
    .values({
      coinId: input.coinId,
      vsCurrency: input.vsCurrency,
      exchangeId: input.exchangeId,
      symbol: input.symbol,
      fetchedAt: input.fetchedAt,
      price: input.price,
      quoteVolume: input.quoteVolume ?? null,
      priceChangePercentage24h: input.priceChangePercentage24h ?? null,
      sourcePayloadJson: input.sourcePayloadJson,
    })
    .onConflictDoNothing()
    .run();
}

export function upsertCanonicalCandle(database: AppDatabase, input: CanonicalCandleInput) {
  return upsertCanonicalOhlcvCandle(database, {
    coinId: input.coinId,
    vsCurrency: input.vsCurrency,
    interval: input.interval,
    timestamp: input.timestamp,
    open: input.price,
    high: input.price,
    low: input.price,
    close: input.price,
    volume: input.volume,
    marketCap: input.marketCap,
    totalVolume: input.totalVolume,
    source: input.source,
  });
}

export function upsertCanonicalOhlcvCandle(database: AppDatabase, input: CanonicalOhlcvCandleInput) {
  const source = input.source ?? 'canonical';
  const setValues = input.replaceExisting
    ? {
        open: input.open,
        high: input.high,
        low: input.low,
        close: input.close,
        volume: input.volume ?? null,
        marketCap: input.marketCap ?? null,
        totalVolume: input.totalVolume ?? null,
      }
    : {
        high: sql`MAX(${ohlcvCandles.high}, ${input.high})`,
        low: sql`MIN(${ohlcvCandles.low}, ${input.low})`,
        close: input.close,
        volume: input.volume ?? null,
        marketCap: input.marketCap ?? null,
        totalVolume: input.totalVolume ?? null,
      };

  database.db
    .insert(ohlcvCandles)
    .values({
      coinId: input.coinId,
      vsCurrency: input.vsCurrency,
      source,
      interval: input.interval,
      timestamp: input.timestamp,
      open: input.open,
      high: input.high,
      low: input.low,
      close: input.close,
      volume: input.volume ?? null,
      marketCap: input.marketCap ?? null,
      totalVolume: input.totalVolume ?? null,
    })
    .onConflictDoUpdate({
      target: [ohlcvCandles.coinId, ohlcvCandles.vsCurrency, ohlcvCandles.source, ohlcvCandles.interval, ohlcvCandles.timestamp],
      set: setValues,
    })
    .run();
}

export function toMinuteBucket(timestampMs: number) {
  return new Date(Math.floor(timestampMs / 60_000) * 60_000);
}

export function toDailyBucket(timestampMs: number) {
  const timestamp = new Date(timestampMs);

  return new Date(Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate()));
}

export function seedDailyCandlesFromCloseSeries(
  rows: Array<{ coinId: string; vsCurrency: string; timestamp: Date; price: number; marketCap: number | null; totalVolume: number | null }>,
) {
  return rows.map((row) => ({
    coinId: row.coinId,
    vsCurrency: row.vsCurrency,
    source: 'canonical',
    interval: '1d',
    timestamp: row.timestamp,
    open: row.price,
    high: row.price,
    low: row.price,
    close: row.price,
    volume: row.totalVolume,
    marketCap: row.marketCap,
    totalVolume: row.totalVolume,
  })) satisfies OhlcvCandleRow[];
}

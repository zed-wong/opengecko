import { describe, expect, it } from 'vitest';

import { buildLiveSnapshotValue, createMarketQuoteAccumulator, getSnapshotOwnership } from '../src/services/market-snapshots';

describe('market snapshot service helpers', () => {
  it('classifies seeded and live snapshot ownership explicitly', () => {
    expect(getSnapshotOwnership({ sourceCount: 0 })).toBe('seeded');
    expect(getSnapshotOwnership({ sourceCount: 2 })).toBe('live');
  });

  it('builds live snapshot updates while preserving seed-owned metadata', () => {
    const accumulator = createMarketQuoteAccumulator();
    accumulator.priceTotal = 171000;
    accumulator.priceCount = 2;
    accumulator.volumeTotal = 60000000000;
    accumulator.volumeCount = 2;
    accumulator.changeTotal = 4;
    accumulator.changeCount = 2;
    accumulator.latestTimestamp = Date.parse('2026-03-20T00:05:00.000Z');
    accumulator.providers.add('binance');
    accumulator.providers.add('kraken');

    const nextSnapshot = buildLiveSnapshotValue(
      'bitcoin',
      accumulator,
      {
        coinId: 'bitcoin',
        vsCurrency: 'usd',
        price: 85000,
        marketCap: 1700000000000,
        totalVolume: 25000000000,
        marketCapRank: 1,
        fullyDilutedValuation: 1785000000000,
        circulatingSupply: 19850000,
        totalSupply: 21000000,
        maxSupply: 21000000,
        ath: 109000,
        athChangePercentage: -22,
        athDate: new Date('2025-12-17T00:00:00.000Z'),
        atl: 15000,
        atlChangePercentage: 466.67,
        atlDate: new Date('2023-11-21T00:00:00.000Z'),
        priceChange24h: 1500,
        priceChangePercentage24h: 1.8,
        sourceProvidersJson: '[]',
        sourceCount: 0,
        updatedAt: new Date('2026-03-20T00:00:00.000Z'),
        lastUpdated: new Date('2026-03-20T00:00:00.000Z'),
      },
      new Date('2026-03-20T00:06:00.000Z'),
    );

    expect(nextSnapshot).toMatchObject({
      coinId: 'bitcoin',
      vsCurrency: 'usd',
      price: 85500,
      marketCap: 1700000000000,
      totalVolume: 30000000000,
      marketCapRank: 1,
      priceChange24h: 1500,
      priceChangePercentage24h: 2,
      sourceCount: 2,
      sourceProvidersJson: JSON.stringify(['binance', 'kraken']),
      updatedAt: new Date('2026-03-20T00:06:00.000Z'),
      lastUpdated: new Date('2026-03-20T00:05:00.000Z'),
    });
  });
});

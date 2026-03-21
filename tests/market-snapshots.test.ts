import { describe, expect, it } from 'vitest';

import { buildLiveSnapshotValue, createMarketQuoteAccumulator, getSnapshotOwnership } from '../src/services/market-snapshots';

describe('market snapshot service helpers', () => {
  it('classifies seeded and live snapshot ownership explicitly', () => {
    expect(getSnapshotOwnership({ sourceCount: 0 })).toBe('seeded');
    expect(getSnapshotOwnership({ sourceCount: 2 })).toBe('live');
  });

  it('builds live snapshot updates without carrying forward seed-owned market fields', () => {
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
      new Date('2026-03-20T00:06:00.000Z'),
    );

    expect(nextSnapshot).toMatchObject({
      coinId: 'bitcoin',
      vsCurrency: 'usd',
      price: 85500,
      marketCap: null,
      totalVolume: 30000000000,
      marketCapRank: null,
      priceChange24h: null,
      priceChangePercentage24h: 2,
      sourceCount: 2,
      sourceProvidersJson: JSON.stringify(['binance', 'kraken']),
      updatedAt: new Date('2026-03-20T00:06:00.000Z'),
      lastUpdated: new Date('2026-03-20T00:05:00.000Z'),
    });
  });
});

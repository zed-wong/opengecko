import { describe, expect, it } from 'vitest';

import { getSnapshotFreshness } from '../src/modules/market-freshness';

describe('market snapshot freshness', () => {
  it('marks recent snapshots as fresh and exposes provider metadata', () => {
    const freshness = getSnapshotFreshness(
      {
        lastUpdated: new Date('2026-03-20T00:04:00.000Z'),
        sourceProvidersJson: JSON.stringify(['binance', 'kraken']),
        sourceCount: 2,
      },
      300,
      Date.parse('2026-03-20T00:05:00.000Z'),
    );

    expect(freshness).toEqual({
      ageSeconds: 60,
      isStale: false,
      providers: ['binance', 'kraken'],
      sourceCount: 2,
    });
  });

  it('marks old snapshots as stale', () => {
    const freshness = getSnapshotFreshness(
      {
        lastUpdated: new Date('2026-03-20T00:00:00.000Z'),
        sourceProvidersJson: JSON.stringify(['coinbase']),
        sourceCount: 1,
      },
      300,
      Date.parse('2026-03-20T00:10:01.000Z'),
    );

    expect(freshness.isStale).toBe(true);
    expect(freshness.ageSeconds).toBe(601);
  });
});

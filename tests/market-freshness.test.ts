import { describe, expect, it } from 'vitest';

import { getSnapshotAccessPolicy, getSnapshotFreshness, getUsableSnapshot } from '../src/modules/market-freshness';

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

  it('keeps seeded fallback available before boot refresh completes', () => {
    const snapshot = {
      lastUpdated: new Date('2026-03-20T00:00:00.000Z'),
      sourceProvidersJson: '[]',
      sourceCount: 0,
    };

    expect(getUsableSnapshot(
      snapshot,
      300,
      getSnapshotAccessPolicy({ hasCompletedBootMarketRefresh: false }),
      Date.parse('2026-03-20T00:01:00.000Z'),
    )).toEqual(snapshot);
  });

  it('disables seeded fallback after boot refresh completes', () => {
    expect(getUsableSnapshot(
      {
        lastUpdated: new Date('2026-03-20T00:00:00.000Z'),
        sourceProvidersJson: '[]',
        sourceCount: 0,
      },
      300,
      getSnapshotAccessPolicy({ hasCompletedBootMarketRefresh: true }),
      Date.parse('2026-03-20T00:01:00.000Z'),
    )).toBeNull();
  });
});

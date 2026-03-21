import type { MarketSnapshotRow } from '../db/schema';

export type SnapshotOwnership = 'seeded' | 'live';

export type MarketQuoteAccumulator = {
  priceTotal: number;
  priceCount: number;
  volumeTotal: number;
  volumeCount: number;
  changeTotal: number;
  changeCount: number;
  latestTimestamp: number;
  providers: Set<string>;
};

export function createMarketQuoteAccumulator(): MarketQuoteAccumulator {
  return {
    priceTotal: 0,
    priceCount: 0,
    volumeTotal: 0,
    volumeCount: 0,
    changeTotal: 0,
    changeCount: 0,
    latestTimestamp: 0,
    providers: new Set<string>(),
  };
}

export function getSnapshotOwnership(snapshot: Pick<MarketSnapshotRow, 'sourceCount'>): SnapshotOwnership {
  return snapshot.sourceCount > 0 ? 'live' : 'seeded';
}

export function buildLiveSnapshotValue(
  coinId: string,
  accumulator: MarketQuoteAccumulator,
  now: Date,
) {
  return {
    coinId,
    vsCurrency: 'usd',
    price: accumulator.priceTotal / accumulator.priceCount,
    marketCap: null,
    totalVolume: accumulator.volumeCount === 0 ? null : accumulator.volumeTotal / accumulator.volumeCount,
    marketCapRank: null,
    fullyDilutedValuation: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    athChangePercentage: null,
    athDate: null,
    atl: null,
    atlChangePercentage: null,
    atlDate: null,
    priceChange24h: null,
    priceChangePercentage24h: accumulator.changeCount === 0 ? null : accumulator.changeTotal / accumulator.changeCount,
    sourceProvidersJson: JSON.stringify([...accumulator.providers].sort()),
    sourceCount: accumulator.providers.size,
    updatedAt: now,
    lastUpdated: new Date(accumulator.latestTimestamp || now.getTime()),
  };
}

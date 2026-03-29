import BigNumber from 'bignumber.js';

import type { MarketSnapshotRow } from '../db/schema';

export type SnapshotOwnership = 'seeded' | 'live';

export type MarketQuoteAccumulator = {
  priceTotal: BigNumber;
  priceCount: number;
  volumeTotal: BigNumber;
  volumeCount: number;
  changeTotal: BigNumber;
  changeCount: number;
  latestTimestamp: number;
  providers: Set<string>;
};

function scaleByPriceRatio(value: number | null, previousPrice: number | null | undefined, nextPrice: number) {
  if (value === null || previousPrice === null || previousPrice === undefined || previousPrice <= 0) {
    return null;
  }

  return new BigNumber(value)
    .multipliedBy(new BigNumber(nextPrice).dividedBy(previousPrice))
    .toNumber();
}

export function createMarketQuoteAccumulator(): MarketQuoteAccumulator {
  return {
    priceTotal: new BigNumber(0),
    priceCount: 0,
    volumeTotal: new BigNumber(0),
    volumeCount: 0,
    changeTotal: new BigNumber(0),
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
  previousSnapshot: Pick<
    MarketSnapshotRow,
    | 'price'
    | 'marketCap'
    | 'marketCapRank'
    | 'fullyDilutedValuation'
    | 'circulatingSupply'
    | 'totalSupply'
    | 'maxSupply'
    | 'ath'
    | 'athDate'
    | 'atl'
    | 'atlDate'
    | 'priceChangePercentage24h'
  > | null,
  vsCurrency: string,
  now: Date,
) {
  const price = accumulator.priceTotal.dividedBy(accumulator.priceCount).toNumber();
  const previousPrice = previousSnapshot?.price ?? null;
  const ath = previousSnapshot?.ath === null || previousSnapshot?.ath === undefined
    ? price
    : Math.max(previousSnapshot.ath, price);
  const atl = previousSnapshot?.atl === null || previousSnapshot?.atl === undefined
    ? price
    : Math.min(previousSnapshot.atl, price);
  const priceChangePercentage24h = accumulator.changeCount === 0
    ? previousSnapshot?.priceChangePercentage24h ?? null
    : accumulator.changeTotal.dividedBy(accumulator.changeCount).toNumber();
  const priceChange24h = priceChangePercentage24h === null || priceChangePercentage24h <= -100
    ? null
    : new BigNumber(price)
      .minus(
        new BigNumber(price).dividedBy(
          new BigNumber(1).plus(new BigNumber(priceChangePercentage24h).dividedBy(100)),
        ),
      )
      .toNumber();

  return {
    coinId,
    vsCurrency,
    price,
    marketCap: previousSnapshot?.circulatingSupply
      ? new BigNumber(price).multipliedBy(previousSnapshot.circulatingSupply).toNumber()
      : scaleByPriceRatio(previousSnapshot?.marketCap ?? null, previousPrice, price),
    totalVolume: accumulator.volumeCount === 0 ? null : accumulator.volumeTotal.dividedBy(accumulator.volumeCount).toNumber(),
    marketCapRank: previousSnapshot?.marketCapRank ?? null,
    fullyDilutedValuation: previousSnapshot?.maxSupply
      ? new BigNumber(price).multipliedBy(previousSnapshot.maxSupply).toNumber()
      : previousSnapshot?.totalSupply
        ? new BigNumber(price).multipliedBy(previousSnapshot.totalSupply).toNumber()
        : scaleByPriceRatio(previousSnapshot?.fullyDilutedValuation ?? null, previousPrice, price),
    circulatingSupply: previousSnapshot?.circulatingSupply ?? null,
    totalSupply: previousSnapshot?.totalSupply ?? null,
    maxSupply: previousSnapshot?.maxSupply ?? null,
    ath,
    athChangePercentage: ath === 0
      ? null
      : new BigNumber(price).minus(ath).dividedBy(ath).multipliedBy(100).toNumber(),
    athDate: ath === price ? now : previousSnapshot?.athDate ?? null,
    atl,
    atlChangePercentage: atl === 0
      ? null
      : new BigNumber(price).minus(atl).dividedBy(atl).multipliedBy(100).toNumber(),
    atlDate: atl === price ? now : previousSnapshot?.atlDate ?? null,
    priceChange24h,
    priceChangePercentage24h,
    sourceProvidersJson: JSON.stringify([...accumulator.providers].sort()),
    sourceCount: accumulator.providers.size,
    updatedAt: now,
    lastUpdated: new Date(accumulator.latestTimestamp || now.getTime()),
  };
}

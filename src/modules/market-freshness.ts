import type { MarketSnapshotRow } from '../db/schema';
import type { MarketDataRuntimeState } from '../services/market-runtime-state';
import { getSnapshotOwnership } from '../services/market-snapshots';

export type SnapshotFreshness = {
  ageSeconds: number;
  isStale: boolean;
  providers: string[];
  sourceCount: number;
};

export type SnapshotAccessPolicy = {
  allowSeededFallback: boolean;
};

export function isLiveSnapshot(snapshot: Pick<MarketSnapshotRow, 'sourceCount'>) {
  return getSnapshotOwnership(snapshot) === 'live';
}

export function getSnapshotFreshness(
  snapshot: Pick<MarketSnapshotRow, 'lastUpdated' | 'sourceProvidersJson' | 'sourceCount'>,
  thresholdSeconds: number,
  now = Date.now(),
): SnapshotFreshness {
  const ageSeconds = Math.max(0, Math.floor((now - snapshot.lastUpdated.getTime()) / 1000));

  return {
    ageSeconds,
    isStale: ageSeconds > thresholdSeconds,
    providers: JSON.parse(snapshot.sourceProvidersJson) as string[],
    sourceCount: snapshot.sourceCount,
  };
}

export function getSnapshotAccessPolicy(runtimeState: MarketDataRuntimeState): SnapshotAccessPolicy {
  return {
    allowSeededFallback: !runtimeState.hasCompletedBootMarketRefresh,
  };
}

export function getUsableSnapshot<T extends Pick<MarketSnapshotRow, 'lastUpdated' | 'sourceProvidersJson' | 'sourceCount'>>(
  snapshot: T | null,
  thresholdSeconds: number,
  accessPolicy: SnapshotAccessPolicy,
  now = Date.now(),
) {
  if (!snapshot) {
    return null;
  }

  if (!isLiveSnapshot(snapshot)) {
    if (!accessPolicy.allowSeededFallback) {
      return null;
    }

    return snapshot;
  }

  return getSnapshotFreshness(snapshot, thresholdSeconds, now).isStale ? null : snapshot;
}

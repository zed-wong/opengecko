export type MarketDataRuntimeState = {
  hasCompletedBootMarketRefresh: boolean;
};

export function createMarketDataRuntimeState(): MarketDataRuntimeState {
  return {
    hasCompletedBootMarketRefresh: false,
  };
}

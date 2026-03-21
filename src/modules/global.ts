import type { FastifyInstance } from 'fastify';

import type { AppDatabase } from '../db/client';
import { getConversionRate, SUPPORTED_VS_CURRENCIES } from '../lib/conversion';
import { getMarketRows } from './catalog';
import { getUsableSnapshot } from './market-freshness';

export function registerGlobalRoutes(app: FastifyInstance, database: AppDatabase, marketFreshnessThresholdSeconds: number) {
  app.get('/global', async () => {
    const marketRows = getMarketRows(database, 'usd', { status: 'active' })
      .map((row) => ({
        coin: row.coin,
        snapshot: getUsableSnapshot(row.snapshot, marketFreshnessThresholdSeconds),
      }))
      .filter((row) => row.snapshot);
    const activeCoinCount = getMarketRows(database, 'usd', { status: 'active' }).length;
    const totalMarketCapUsd = marketRows.reduce((sum, row) => sum + (row.snapshot?.marketCap ?? 0), 0);
    const totalVolumeUsd = marketRows.reduce((sum, row) => sum + (row.snapshot?.totalVolume ?? 0), 0);
    const totalMarketCap = Object.fromEntries(
      SUPPORTED_VS_CURRENCIES.map((currency) => [currency, totalMarketCapUsd * getConversionRate(currency)]),
    );
    const totalVolume = Object.fromEntries(
      SUPPORTED_VS_CURRENCIES.map((currency) => [currency, totalVolumeUsd * getConversionRate(currency)]),
    );
    const btcMarketCap = marketRows.find((row) => row.coin.id === 'bitcoin')?.snapshot?.marketCap ?? 0;
    const ethMarketCap = marketRows.find((row) => row.coin.id === 'ethereum')?.snapshot?.marketCap ?? 0;
    const usdcMarketCap = marketRows.find((row) => row.coin.id === 'usd-coin')?.snapshot?.marketCap ?? 0;

    return {
      data: {
        active_cryptocurrencies: activeCoinCount,
        upcoming_icos: 0,
        ongoing_icos: 0,
        ended_icos: 0,
        markets: 3,
        total_market_cap: totalMarketCap,
        total_volume: totalVolume,
        market_cap_percentage: {
          btc: totalMarketCapUsd === 0 ? 0 : (btcMarketCap / totalMarketCapUsd) * 100,
          eth: totalMarketCapUsd === 0 ? 0 : (ethMarketCap / totalMarketCapUsd) * 100,
          usdc: totalMarketCapUsd === 0 ? 0 : (usdcMarketCap / totalMarketCapUsd) * 100,
        },
        market_cap_change_percentage_24h_usd: 1.42,
        updated_at: Math.floor(Date.parse('2026-03-20T00:00:00.000Z') / 1000),
      },
    };
  });
}

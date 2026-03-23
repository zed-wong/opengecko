import type { AppDatabase } from '../db/client';
import { HttpError } from '../http/errors';
import { getMarketRows } from '../modules/catalog';
import { getUsableSnapshot, type SnapshotAccessPolicy } from '../modules/market-freshness';
import { getCurrencyApiSnapshot } from '../services/currency-rates';

export const SUPPORTED_VS_CURRENCIES = ['usd', 'eur', 'btc', 'eth'] as const;

const RATE_METADATA: Record<string, { name: string; unit: string; type: 'crypto' | 'fiat' }> = {
  btc: { name: 'Bitcoin', unit: 'BTC', type: 'crypto' },
  eth: { name: 'Ether', unit: 'ETH', type: 'crypto' },
  usd: { name: 'US Dollar', unit: '$', type: 'fiat' },
  eur: { name: 'Euro', unit: '€', type: 'fiat' },
  usdt: { name: 'Tether', unit: 'USDT', type: 'fiat' },
};

function getCoinSnapshot(
  database: AppDatabase,
  coinId: string,
  vsCurrency: 'usd' | 'eur' | 'btc' | 'eth',
  marketFreshnessThresholdSeconds: number,
  snapshotAccessPolicy: SnapshotAccessPolicy,
) {
  return getUsableSnapshot(
    getMarketRows(database, vsCurrency, { ids: [coinId], status: 'all' })[0]?.snapshot ?? null,
    marketFreshnessThresholdSeconds,
    snapshotAccessPolicy,
  );
}

export function getConversionRates(
  database: AppDatabase,
  marketFreshnessThresholdSeconds: number,
  snapshotAccessPolicy: SnapshotAccessPolicy,
) {
  const currencyApiSnapshot = getCurrencyApiSnapshot();
  const usdPerUsdt = currencyApiSnapshot.usdt.usd;
  const bitcoinUsdSnapshot = getCoinSnapshot(database, 'bitcoin', 'usd', marketFreshnessThresholdSeconds, snapshotAccessPolicy);
  const ethereumUsdSnapshot = getCoinSnapshot(database, 'ethereum', 'usd', marketFreshnessThresholdSeconds, snapshotAccessPolicy);
  const rates = Object.fromEntries(
    Object.entries(currencyApiSnapshot.usdt)
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .map(([currencyCode, value]) => [currencyCode.toLowerCase(), value / usdPerUsdt]),
  ) as Record<string, number>;

  rates.usd = 1;
  rates.btc = bitcoinUsdSnapshot && bitcoinUsdSnapshot.price > 0
    ? 1 / bitcoinUsdSnapshot.price
    : currencyApiSnapshot.usdt.btc / usdPerUsdt;
  rates.eth = ethereumUsdSnapshot && ethereumUsdSnapshot.price > 0
    ? 1 / ethereumUsdSnapshot.price
    : currencyApiSnapshot.usdt.eth / usdPerUsdt;

  return rates;
}

export function getConversionRate(
  database: AppDatabase,
  vsCurrency: string,
  marketFreshnessThresholdSeconds: number,
  snapshotAccessPolicy: SnapshotAccessPolicy,
) {
  const normalized = vsCurrency.toLowerCase();
  const rates = getConversionRates(database, marketFreshnessThresholdSeconds, snapshotAccessPolicy);

  if (normalized in rates && Number.isFinite(rates[normalized]) && rates[normalized] > 0) {
    return rates[normalized];
  }

  throw new HttpError(400, 'invalid_parameter', `Unsupported vs_currency: ${vsCurrency}`);
}

export function buildExchangeRatesPayload(
  database: AppDatabase,
  marketFreshnessThresholdSeconds: number,
  snapshotAccessPolicy: SnapshotAccessPolicy,
) {
  const conversionRates = getConversionRates(database, marketFreshnessThresholdSeconds, snapshotAccessPolicy);
  const bitcoinValueUsd = 1 / conversionRates.btc;
  const sortedCodes = Object.keys(conversionRates).sort((left, right) => {
    if (left === 'btc') return -1;
    if (right === 'btc') return 1;
    return left.localeCompare(right);
  });

  const data = Object.fromEntries(sortedCodes.map((code) => {
    const normalizedCode = code.toLowerCase();
    const metadata = RATE_METADATA[normalizedCode] ?? {
      name: normalizedCode.toUpperCase(),
      unit: normalizedCode.toUpperCase(),
      type: 'fiat' as const,
    };

    const value = normalizedCode === 'btc'
      ? 1
      : bitcoinValueUsd * conversionRates[normalizedCode];

    return [normalizedCode, {
      name: metadata.name,
      unit: metadata.unit,
      value,
      type: metadata.type,
    }];
  }));

  return {
    data,
  };
}

import { HttpError } from '../http/errors';

export const SUPPORTED_VS_CURRENCIES = ['usd', 'eur', 'btc', 'eth'] as const;

const USD_CONVERSION_RATES = {
  usd: 1,
  eur: 0.92,
  btc: 1 / 85_000,
  eth: 1 / 2_000,
} as const satisfies Record<(typeof SUPPORTED_VS_CURRENCIES)[number], number>;

export function getConversionRate(vsCurrency: string) {
  const normalized = vsCurrency.toLowerCase();

  if (normalized in USD_CONVERSION_RATES) {
    return USD_CONVERSION_RATES[normalized as keyof typeof USD_CONVERSION_RATES];
  }

  throw new HttpError(400, 'invalid_parameter', `Unsupported vs_currency: ${vsCurrency}`);
}

export function buildExchangeRatesPayload() {
  return {
    rates: {
      btc: {
        name: 'Bitcoin',
        unit: 'BTC',
        value: 1,
        type: 'crypto',
      },
      eth: {
        name: 'Ether',
        unit: 'ETH',
        value: 85_000 / 2_000,
        type: 'crypto',
      },
      usd: {
        name: 'US Dollar',
        unit: '$',
        value: 85_000,
        type: 'fiat',
      },
      eur: {
        name: 'Euro',
        unit: '€',
        value: 85_000 * getConversionRate('eur'),
        type: 'fiat',
      },
    },
  };
}

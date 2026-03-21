import { describe, expect, it } from 'vitest';

import { HttpError } from '../src/http/errors';
import { buildExchangeRatesPayload, getConversionRate, SUPPORTED_VS_CURRENCIES } from '../src/lib/conversion';

describe('conversion helpers', () => {
  it('exposes the supported vs currencies from one shared module', () => {
    expect([...SUPPORTED_VS_CURRENCIES]).toEqual(['usd', 'eur', 'btc', 'eth']);
  });

  it('returns stable conversion rates for supported currencies', () => {
    expect(getConversionRate('usd')).toBe(1);
    expect(getConversionRate('eur')).toBe(0.92);
    expect(getConversionRate('btc')).toBe(1 / 85_000);
    expect(getConversionRate('eth')).toBe(1 / 2_000);
  });

  it('throws consistently for unsupported currencies', () => {
    expect(() => getConversionRate('sgd')).toThrowError(HttpError);
    expect(() => getConversionRate('sgd')).toThrow('Unsupported vs_currency: sgd');
  });

  it('builds the exchange-rates payload from the shared conversion source', () => {
    expect(buildExchangeRatesPayload()).toEqual({
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
          value: 42.5,
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
          value: 78_200,
          type: 'fiat',
        },
      },
    });
  });
});

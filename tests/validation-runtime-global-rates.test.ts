import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { resetCurrencyApiSnapshotForTests } from '../src/services/currency-rates';

describe('validation runtime global and exchange-rates surface prep', () => {
  beforeEach(() => {
    resetCurrencyApiSnapshotForTests();
  });

  afterEach(() => {
    delete process.env.DISABLE_REMOTE_CURRENCY_REFRESH;
  });

  it('keeps bootstrap-only validation /global on the seeded-bootstrap shape with broader aggregates', async () => {
    const app = buildApp({
      config: {
        host: '127.0.0.1',
        port: 3102,
        databaseUrl: ':memory:',
        ccxtExchanges: [],
        logLevel: 'silent',
        disableRemoteCurrencyRefresh: true,
      },
      startBackgroundJobs: false,
    });

    try {
      await app.ready();

      expect(app.marketDataRuntimeState.validationOverride.mode).toBe('seeded_bootstrap');

      const response = await app.inject({
        method: 'GET',
        url: '/global',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          active_cryptocurrencies: expect.any(Number),
          markets: expect.any(Number),
          total_market_cap: expect.objectContaining({
            usd: expect.any(Number),
            eur: expect.any(Number),
            btc: expect.any(Number),
            eth: expect.any(Number),
          }),
          total_volume: expect.objectContaining({
            usd: expect.any(Number),
            eur: expect.any(Number),
            btc: expect.any(Number),
            eth: expect.any(Number),
          }),
          market_cap_percentage: expect.objectContaining({
            btc: expect.any(Number),
            eth: expect.any(Number),
            usdc: expect.any(Number),
            usdt: expect.any(Number),
            bnb: expect.any(Number),
            xrp: expect.any(Number),
            sol: expect.any(Number),
          }),
          updated_at: expect.any(Number),
        },
      });
    } finally {
      await app.close();
    }
  });

  it('keeps bootstrap-only validation /exchange_rates on the seeded bootstrap conversion map', async () => {
    const app = buildApp({
      config: {
        host: '127.0.0.1',
        port: 3102,
        databaseUrl: ':memory:',
        ccxtExchanges: [],
        logLevel: 'silent',
        disableRemoteCurrencyRefresh: true,
      },
      startBackgroundJobs: false,
    });

    try {
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/exchange_rates',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          btc: {
            name: 'Bitcoin',
            unit: 'BTC',
            value: 1,
            type: 'crypto',
          },
          eth: {
            name: 'Ether',
            unit: 'ETH',
            value: expect.any(Number),
            type: 'crypto',
          },
          usd: {
            name: 'US Dollar',
            unit: '$',
            value: expect.any(Number),
            type: 'fiat',
          },
          eur: {
            name: 'Euro',
            unit: '€',
            value: expect.any(Number),
            type: 'fiat',
          },
          usdt: {
            name: 'Tether',
            unit: 'USDT',
            value: expect.any(Number),
            type: 'fiat',
          },
        },
      });

      const body = response.json();
      expect(Object.keys(body.data).sort()).toEqual(['btc', 'eth', 'eur', 'usd', 'usdt']);
      expect(body.data.usdt.value).toBeGreaterThan(body.data.usd.value);
    } finally {
      await app.close();
    }
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('ccxt', () => {
  class BinanceExchange {
    markets = {
      'BTC/USDT': { symbol: 'BTC/USDT' },
    };
    has = { fetchTickers: true };

    async loadMarkets() {
      return this.markets;
    }

    async fetchTickers() {
      return {
        'BTC/USDT': {
          symbol: 'BTC/USDT',
          last: 90000,
          bid: 89900,
          ask: 90100,
          high: 91000,
          low: 89000,
          baseVolume: 100,
          quoteVolume: 9000000,
          percentage: 1.2,
          timestamp: 1774191714871,
        },
      };
    }

    async close() {
      return undefined;
    }
  }

  const ccxtModule = {
    exchanges: ['binance'],
    binance: BinanceExchange,
  };

  return {
    default: ccxtModule,
    exchanges: ccxtModule.exchanges,
  };
});

describe('ccxt provider adapter', () => {
  it('recognizes known exchange ids from the ccxt exchange name list', async () => {
    const { getValidExchangeIds, isValidExchangeId } = await import('../src/providers/ccxt');

    expect(isValidExchangeId('binance')).toBe(true);
    expect(isValidExchangeId('coinbase')).toBe(false);
    expect(getValidExchangeIds()).toEqual(['binance']);
  });

  it('creates known exchange clients from the ccxt module export', async () => {
    const { fetchExchangeTickers } = await import('../src/providers/ccxt');

    const rows = await fetchExchangeTickers('binance', ['BTC/USDT']);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exchangeId: 'binance',
      symbol: 'BTC/USDT',
      last: 90000,
    });
  });
});

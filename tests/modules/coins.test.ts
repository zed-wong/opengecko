import { describe, expect, it } from 'vitest';
import { extractCoinMetadata } from '../../src/providers/ccxt';
import type { ExchangeMarketSnapshot } from '../../src/providers/ccxt';

function buildMarket(overrides: Partial<ExchangeMarketSnapshot> & { raw?: unknown }): ExchangeMarketSnapshot {
  return {
    exchangeId: 'binance',
    symbol: `${overrides.base ?? 'BTC'}/USDT`,
    base: overrides.base ?? 'BTC',
    quote: overrides.quote ?? 'USDT',
    active: true,
    spot: true,
    baseName: overrides.baseName ?? null,
    raw: overrides.raw ?? {},
  };
}

describe('coin enrichment', () => {
  it('extracts metadata from CCXT market info', () => {
    const markets: ExchangeMarketSnapshot[] = [
      buildMarket({
        base: 'BTC',
        baseName: 'Bitcoin',
        raw: {
          description: 'Bitcoin is a digital currency',
          info: {
            website: 'https://bitcoin.org',
            explorer: 'https://blockchain.com',
            sourceCode: 'https://github.com/bitcoin/bitcoin',
            whitepaper: 'https://bitcoin.org/bitcoin.pdf',
          },
        },
      }),
      buildMarket({
        base: 'ETH',
        baseName: 'Ethereum',
        raw: {},
      }),
    ];

    const result = extractCoinMetadata(markets, 'bitcoin');

    expect(result).toEqual({
      description: 'Bitcoin is a digital currency',
      website: 'https://bitcoin.org',
      explorer: 'https://blockchain.com',
      sourceCode: 'https://github.com/bitcoin/bitcoin',
      whitepaper: 'https://bitcoin.org/bitcoin.pdf',
    });
  });

  it('returns null when no markets match the coin id', () => {
    const markets: ExchangeMarketSnapshot[] = [
      buildMarket({ base: 'ETH', baseName: 'Ethereum', raw: {} }),
    ];

    expect(extractCoinMetadata(markets, 'bitcoin')).toBeNull();
  });

  it('matches by base symbol case-insensitively', () => {
    const markets: ExchangeMarketSnapshot[] = [
      buildMarket({
        base: 'btc',
        raw: {
          description: 'Bitcoin desc',
          info: { website: 'https://bitcoin.org' },
        },
      }),
    ];

    const result = extractCoinMetadata(markets, 'BTC');

    expect(result).not.toBeNull();
    expect(result!.description).toBe('Bitcoin desc');
    expect(result!.website).toBe('https://bitcoin.org');
  });

  it('matches by baseName case-insensitively', () => {
    const markets: ExchangeMarketSnapshot[] = [
      buildMarket({
        base: 'XBT',
        baseName: 'Bitcoin',
        raw: {
          description: 'Bitcoin via XBT',
          info: {},
        },
      }),
    ];

    const result = extractCoinMetadata(markets, 'bitcoin');

    expect(result).not.toBeNull();
    expect(result!.description).toBe('Bitcoin via XBT');
  });

  it('returns null fields when raw info is sparse', () => {
    const markets: ExchangeMarketSnapshot[] = [
      buildMarket({
        base: 'BTC',
        raw: {},
      }),
    ];

    const result = extractCoinMetadata(markets, 'BTC');

    expect(result).toEqual({
      description: null,
      website: null,
      explorer: null,
      sourceCode: null,
      whitepaper: null,
    });
  });

  it('returns null for empty markets array', () => {
    expect(extractCoinMetadata([], 'bitcoin')).toBeNull();
  });
});

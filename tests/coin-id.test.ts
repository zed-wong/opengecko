import { describe, expect, it } from 'vitest';

import { buildCoinId, buildCoinName, COIN_ID_OVERRIDES } from '../src/lib/coin-id';

describe('buildCoinId', () => {
  it('returns override for known symbols', () => {
    expect(buildCoinId('BTC', 'Bitcoin')).toBe('bitcoin');
    expect(buildCoinId('ETH', 'Ethereum')).toBe('ethereum');
    expect(buildCoinId('DOGE', 'Dogecoin')).toBe('dogecoin');
    expect(buildCoinId('SOL', 'Solana')).toBe('solana');
  });

  it('is case-insensitive for symbol matching', () => {
    expect(buildCoinId('btc', 'Bitcoin')).toBe('bitcoin');
    expect(buildCoinId('Btc', 'Bitcoin')).toBe('bitcoin');
  });

  it('falls back to slugified name for unknown symbols', () => {
    expect(buildCoinId('XYZ', 'Some Token')).toBe('some-token');
    expect(buildCoinId('ABC', 'A B C')).toBe('a-b-c');
  });

  it('falls back to lowercase symbol when name is null', () => {
    expect(buildCoinId('FOO', null)).toBe('foo');
  });

  it('falls back to lowercase symbol when name matches symbol', () => {
    expect(buildCoinId('FOO', 'FOO')).toBe('foo');
  });
});

describe('buildCoinName', () => {
  it('returns trimmed name when available', () => {
    expect(buildCoinName('BTC', 'Bitcoin')).toBe('Bitcoin');
    expect(buildCoinName('btc', '  Bitcoin  ')).toBe('Bitcoin');
  });

  it('returns uppercased symbol when name is null', () => {
    expect(buildCoinName('btc', null)).toBe('BTC');
  });

  it('returns uppercased symbol when name is empty', () => {
    expect(buildCoinName('btc', '')).toBe('BTC');
  });
});

describe('COIN_ID_OVERRIDES', () => {
  it('contains expected major coins', () => {
    expect(COIN_ID_OVERRIDES.BTC).toBe('bitcoin');
    expect(COIN_ID_OVERRIDES.ETH).toBe('ethereum');
    expect(COIN_ID_OVERRIDES.SOL).toBe('solana');
    expect(COIN_ID_OVERRIDES.XRP).toBe('ripple');
    expect(COIN_ID_OVERRIDES.DOGE).toBe('dogecoin');
    expect(COIN_ID_OVERRIDES.USDC).toBe('usd-coin');
  });
});

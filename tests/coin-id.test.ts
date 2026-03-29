import { describe, expect, it } from 'vitest';

import { buildCoinId, buildCoinName, COIN_ID_OVERRIDES, COIN_NAME_OVERRIDES } from '../src/lib/coin-id';

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
  it('returns canonical override names for known symbols even when exchange metadata is abbreviated', () => {
    expect(buildCoinName('BTC', 'BTC')).toBe('Bitcoin');
    expect(buildCoinName('ETH', 'ETH')).toBe('Ethereum');
    expect(buildCoinName('SOL', 'SOL')).toBe('Solana');
    expect(buildCoinName('USDC', 'USDC')).toBe('USDC');
  });

  it('returns trimmed name when available', () => {
    expect(buildCoinName('BTC', 'Bitcoin')).toBe('Bitcoin');
    expect(buildCoinName('btc', '  Bitcoin  ')).toBe('Bitcoin');
  });

  it('prefers canonical override names for known ids when name is null', () => {
    expect(buildCoinName('btc', null)).toBe('Bitcoin');
    expect(buildCoinName('eth', null)).toBe('Ethereum');
  });

  it('prefers canonical override names for known ids when name is empty', () => {
    expect(buildCoinName('btc', '')).toBe('Bitcoin');
    expect(buildCoinName('sol', '')).toBe('Solana');
  });

  it('returns uppercased symbol for unknown ids when name is unavailable', () => {
    expect(buildCoinName('foo', null)).toBe('FOO');
    expect(buildCoinName('foo', '')).toBe('FOO');
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

describe('COIN_NAME_OVERRIDES', () => {
  it('contains expected canonical names for major routed assets', () => {
    expect(COIN_NAME_OVERRIDES.bitcoin).toBe('Bitcoin');
    expect(COIN_NAME_OVERRIDES.ethereum).toBe('Ethereum');
    expect(COIN_NAME_OVERRIDES.solana).toBe('Solana');
    expect(COIN_NAME_OVERRIDES['usd-coin']).toBe('USDC');
    expect(COIN_NAME_OVERRIDES.ripple).toBe('XRP');
  });
});

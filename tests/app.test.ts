import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import contractFixtures from './fixtures/contract-fixtures.json';

describe('OpenGecko app scaffold', () => {
  let app: FastifyInstance | undefined;
  let tempDir: string;

  function getApp() {
    if (!app) {
      throw new Error('Test app was not initialized.');
    }

    return app;
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opengecko-'));
    app = buildApp({
      config: {
        databaseUrl: join(tempDir, 'test.db'),
        logLevel: 'silent',
      },
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves the CoinGecko-compatible ping response', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/ping',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contractFixtures.ping);
  });

  it('returns supported quote currencies', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/simple/supported_vs_currencies',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contractFixtures.supportedVsCurrencies);
  });

  it('returns exchange rates keyed by currency code', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/exchange_rates',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contractFixtures.exchangeRates);
  });

  it('returns simple prices with optional market fields', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,eur&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contractFixtures.simplePrice);
  });

  it('returns token prices by contract address', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/simple/token_price/ethereum?contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48&vs_currencies=usd',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contractFixtures.tokenPrice);
  });

  it('returns seeded asset platforms', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/asset_platforms',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contractFixtures.assetPlatforms);
  });

  it('returns seeded exchanges and exchange detail data', async () => {
    const listResponse = await getApp().inject({
      method: 'GET',
      url: '/exchanges/list',
    });
    const exchangesResponse = await getApp().inject({
      method: 'GET',
      url: '/exchanges?per_page=2&page=1',
    });
    const detailResponse = await getApp().inject({
      method: 'GET',
      url: '/exchanges/binance',
    });
    const volumeChartResponse = await getApp().inject({
      method: 'GET',
      url: '/exchanges/binance/volume_chart?days=7',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(contractFixtures.exchangesList);

    expect(exchangesResponse.statusCode).toBe(200);
    expect(exchangesResponse.json()).toMatchObject(contractFixtures.exchanges);

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject(contractFixtures.exchangeDetail);

    expect(volumeChartResponse.statusCode).toBe(200);
    expect(volumeChartResponse.json()).toEqual(contractFixtures.exchangeVolumeChart);
  });

  it('returns exchange tickers and supports coin filters', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/exchanges/binance/tickers?include_exchange_logo=true',
    });
    const filteredResponse = await getApp().inject({
      method: 'GET',
      url: '/exchanges/binance/tickers?coin_ids=ethereum&order=volume_asc',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(contractFixtures.exchangeTickers);

    expect(filteredResponse.statusCode).toBe(200);
    expect(filteredResponse.json().tickers).toHaveLength(1);
    expect(filteredResponse.json().tickers[0]).toMatchObject({
      coin_id: 'ethereum',
      target: 'USDT',
    });
  });

  it('returns token list data for an asset platform', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/token_lists/ethereum/all.json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(contractFixtures.ethereumTokenList);
  });

  it('returns seeded coins with optional platform data', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/list?include_platform=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 'bitcoin',
        name: 'Bitcoin',
        platforms: {},
        symbol: 'btc',
      },
      {
        id: 'ethereum',
        name: 'Ethereum',
        platforms: {},
        symbol: 'eth',
      },
      {
        id: 'usd-coin',
        name: 'USDC',
        platforms: {
          ethereum: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        },
        symbol: 'usdc',
      },
    ]);
  });

  it('returns market search results', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/search?query=eth',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(contractFixtures.searchEth);
  });

  it('returns FTS-backed category search results', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/search?query=stable',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(contractFixtures.searchStable);
  });

  it('returns global market aggregates', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/global',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(contractFixtures.global);
  });

  it('returns coin market rows', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/markets?vs_currency=usd&sparkline=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({
      id: 'bitcoin',
      current_price: 85000,
      sparkline_in_7d: {
        price: [79000, 80500, 82250, 81750, 83000, 84250, 85000],
      },
    });
  });

  it('supports coin market ordering and pagination defaults', async () => {
    const orderResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/markets?vs_currency=usd&order=market_cap_asc',
    });
    const paginationResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/markets?vs_currency=usd&per_page=1&page=2',
    });

    expect(orderResponse.statusCode).toBe(200);
    expect(orderResponse.json()[0]).toMatchObject({
      id: 'usd-coin',
    });

    expect(paginationResponse.statusCode).toBe(200);
    expect(paginationResponse.json()).toHaveLength(1);
    expect(paginationResponse.json()[0]).toMatchObject({
      id: 'ethereum',
    });
  });

  it('returns a detailed coin payload', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(contractFixtures.coinDetail);
  });

  it('supports optional coin detail flags and omits market data when requested', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin?market_data=false&localization=false&community_data=false&developer_data=false&sparkline=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(contractFixtures.coinDetailWithoutMarketData);
  });

  it('returns richer default coin detail sections', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/ethereum?sparkline=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'ethereum',
      localization: {
        en: 'Ethereum',
      },
      detail_platforms: {},
      community_data: {
        twitter_followers: null,
      },
      developer_data: {
        forks: null,
        code_additions_deletions_4_weeks: {
          additions: null,
          deletions: null,
        },
      },
      community_score: null,
      developer_score: null,
      liquidity_score: null,
      public_interest_score: null,
      public_interest_stats: {
        alexa_rank: null,
        bing_matches: null,
      },
      market_data: {
        high_24h: {
          usd: 2000,
        },
        low_24h: {
          usd: 1850,
        },
        sparkline_7d: {
          price: [1850, 1890, 1920, 1930, 1960, 1980, 2000],
        },
      },
    });
  });

  it('includes seeded tickers in default coin detail responses', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tickers).toHaveLength(2);
    expect(response.json().tickers[0]).toMatchObject({
      base: 'BTC',
      target: 'USDT',
      market: {
        identifier: 'binance',
      },
      trade_url: 'https://www.binance.com/en/trade/BTC_USDT',
    });
  });

  it('returns coin tickers with exchange metadata', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin/tickers?include_exchange_logo=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(contractFixtures.bitcoinTickers);
  });

  it('filters and orders coin tickers', async () => {
    const response = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin/tickers?exchange_ids=coinbase_exchange&order=volume_asc',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tickers).toHaveLength(1);
    expect(response.json().tickers[0]).toMatchObject({
      market: {
        identifier: 'coinbase_exchange',
      },
      target: 'USD',
    });
  });

  it('returns coin history, chart, and ohlc data', async () => {
    const historyResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin/history?date=20-03-2026',
    });
    const chartResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin/market_chart?vs_currency=usd&days=7',
    });
    const maxChartResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin/market_chart?vs_currency=usd&days=max',
    });
    const rangeChartResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin/market_chart/range?vs_currency=usd&from=1773446400&to=1773964800',
    });
    const ohlcResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/bitcoin/ohlc?vs_currency=usd&days=7',
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toMatchObject({
      id: 'bitcoin',
      market_data: {
        current_price: {
          usd: 85000,
        },
      },
    });

    expect(chartResponse.statusCode).toBe(200);
    expect(chartResponse.json().prices[0]).toEqual([1773446400000, 79000]);

    expect(maxChartResponse.statusCode).toBe(200);
    expect(maxChartResponse.json().prices).toHaveLength(7);

    expect(rangeChartResponse.statusCode).toBe(200);
    expect(rangeChartResponse.json()).toMatchObject(contractFixtures.bitcoinRangeChart);

    expect(ohlcResponse.statusCode).toBe(200);
    expect(ohlcResponse.json()[0]).toEqual([1773446400000, 79000, 79000, 79000, 79000]);
  });

  it('returns categories and contract-address variants', async () => {
    const categoriesListResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/categories/list',
    });
    const categoriesResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/categories',
    });
    const contractResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/ethereum/contract/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    });
    const contractChartResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/ethereum/contract/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48/market_chart?vs_currency=usd&days=7',
    });

    expect(categoriesListResponse.statusCode).toBe(200);
    expect(categoriesListResponse.json()).toMatchObject(contractFixtures.categoriesList);

    expect(categoriesResponse.statusCode).toBe(200);
    expect(categoriesResponse.json()[0]).toMatchObject({
      id: 'smart-contract-platform',
    });

    expect(contractResponse.statusCode).toBe(200);
    expect(contractResponse.json()).toMatchObject({
      id: 'usd-coin',
      symbol: 'usdc',
      detail_platforms: {
        ethereum: {
          contract_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          decimal_place: null,
        },
      },
    });

    expect(contractChartResponse.statusCode).toBe(200);
    expect(contractChartResponse.json().prices[0]).toEqual([1773446400000, 1]);
  });

  it('returns not found for unknown chart-style coin routes', async () => {
    const chartResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/not-a-coin/market_chart?vs_currency=usd&days=7',
    });
    const ohlcResponse = await getApp().inject({
      method: 'GET',
      url: '/coins/not-a-coin/ohlc?vs_currency=usd&days=7',
    });

    expect(chartResponse.statusCode).toBe(404);
    expect(chartResponse.json()).toMatchObject({
      error: 'not_found',
      message: 'Coin not found: not-a-coin',
    });

    expect(ohlcResponse.statusCode).toBe(404);
    expect(ohlcResponse.json()).toMatchObject({
      error: 'not_found',
      message: 'Coin not found: not-a-coin',
    });
  });
});

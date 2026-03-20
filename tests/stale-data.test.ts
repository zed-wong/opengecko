import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createDatabase, type AppDatabase } from '../src/db/client';
import { marketSnapshots } from '../src/db/schema';

describe('stale market snapshot behavior', () => {
  let app: FastifyInstance | undefined;
  let tempDir: string;
  let database: AppDatabase | undefined;
  let databaseUrl: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opengecko-stale-'));
    databaseUrl = join(tempDir, 'test.db');
    app = buildApp({
      config: {
        databaseUrl,
        logLevel: 'silent',
        marketFreshnessThresholdSeconds: 60,
      },
    });
    database = createDatabase(databaseUrl);
  });

  afterEach(async () => {
    if (database) {
      database.client.close();
    }

    if (app) {
      await app.close();
    }

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('treats stale live snapshots as unavailable in market-facing endpoints', async () => {
    database!.db
      .update(marketSnapshots)
      .set({
        sourceProvidersJson: JSON.stringify(['binance']),
        sourceCount: 1,
        lastUpdated: new Date('2026-03-19T00:00:00.000Z'),
      })
      .where(eq(marketSnapshots.coinId, 'bitcoin'))
      .run();

    const simplePriceResponse = await app!.inject({
      method: 'GET',
      url: '/simple/price?ids=bitcoin&vs_currencies=usd',
    });
    const coinDetailResponse = await app!.inject({
      method: 'GET',
      url: '/coins/bitcoin',
    });
    const marketsResponse = await app!.inject({
      method: 'GET',
      url: '/coins/markets?vs_currency=usd&ids=bitcoin',
    });

    expect(simplePriceResponse.statusCode).toBe(200);
    expect(simplePriceResponse.json()).toEqual({});

    expect(coinDetailResponse.statusCode).toBe(200);
    expect(coinDetailResponse.json().market_data).toBeNull();

    expect(marketsResponse.statusCode).toBe(200);
    expect(marketsResponse.json()[0]).toMatchObject({
      id: 'bitcoin',
      current_price: null,
      market_cap: null,
      total_volume: null,
    });
  });

  it('keeps seeded snapshots usable before live provider data exists', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/simple/price?ids=bitcoin&vs_currencies=usd',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      bitcoin: {
        usd: 85000,
      },
    });
  });
});

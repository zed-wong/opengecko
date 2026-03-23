import { describe, expect, it } from 'vitest';

import { createDatabase, detectSqliteRuntime, migrateDatabase, type AppDatabase } from '../src/db/client';
import { coins } from '../src/db/schema';

describe('sqlite runtime support', () => {
  it('detects the active runtime consistently', () => {
    const expectedRuntime = process.versions.bun ? 'bun' : 'node';

    expect(detectSqliteRuntime()).toBe(expectedRuntime);
  });

  it('creates a shared Drizzle database wrapper that can run basic queries', () => {
    const database: AppDatabase = createDatabase(':memory:');

    try {
      migrateDatabase(database);

      const now = new Date();
      database.db
        .insert(coins)
        .values({
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          apiSymbol: 'bitcoin',
          hashingAlgorithm: null,
          blockTimeInMinutes: null,
          categoriesJson: '[]',
          descriptionJson: '{}',
          linksJson: '{}',
          imageThumbUrl: null,
          imageSmallUrl: null,
          imageLargeUrl: null,
          marketCapRank: null,
          genesisDate: null,
          platformsJson: '{}',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const storedCoin = database.db.select().from(coins).get();

      expect(database.runtime).toBe(detectSqliteRuntime());
      expect(storedCoin?.id).toBe('bitcoin');
    } finally {
      database.client.close();
    }
  });
});

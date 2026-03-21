import { loadConfig } from '../config/env';
import { createDatabase, initializeDatabase } from '../db/client';
import { runMarketRefreshOnce } from '../services/market-refresh';

async function refreshMarketSnapshots() {
  const config = loadConfig();
  const database = createDatabase(config.databaseUrl);

  try {
    initializeDatabase(database);
    await runMarketRefreshOnce(database, config);
  } finally {
    database.client.close();
  }
}

void refreshMarketSnapshots();

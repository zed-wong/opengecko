import { loadConfig } from '../config/env';
import { createDatabase, initializeDatabase } from '../db/client';
import { rebuildSearchIndex } from '../db/search-index';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

try {
  initializeDatabase(database);
  rebuildSearchIndex(database);
} finally {
  database.client.close();
}

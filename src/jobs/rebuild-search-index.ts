import { loadConfig } from '../config/env';
import { createDatabase, initializeDatabase } from '../db/client';
import { runSearchRebuildOnce } from '../services/search-rebuild';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

async function rebuildSearchIndexJob() {
  try {
    initializeDatabase(database);
    await runSearchRebuildOnce(database);
  } finally {
    database.client.close();
  }
}

void rebuildSearchIndexJob();

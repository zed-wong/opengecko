import { loadConfig } from '../config/env';
import { createDatabase, migrateDatabase } from './client';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

try {
  migrateDatabase(database);
} finally {
  database.client.close();
}

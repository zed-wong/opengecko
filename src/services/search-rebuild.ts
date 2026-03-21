import type { AppDatabase } from '../db/client';
import { rebuildSearchIndex } from '../db/search-index';

export async function runSearchRebuildOnce(database: AppDatabase) {
  rebuildSearchIndex(database);
}

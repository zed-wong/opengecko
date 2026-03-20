import type { AppDatabase } from './client';
import { categories, coins } from './schema';

const CREATE_SEARCH_INDEX_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(
    doc_type UNINDEXED,
    ref_id UNINDEXED,
    name,
    symbol,
    api_symbol,
    categories,
    tokenize = 'unicode61'
  );
`;

export type SearchDocumentMatch = {
  docType: 'coin' | 'category';
  refId: string;
  rank: number;
};

function normalizeSearchToken(value: string) {
  return value.replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

function buildMatchExpression(query: string) {
  const tokens = normalizeSearchToken(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `${token}*`);

  return tokens.join(' ');
}

export function ensureSearchIndex(database: AppDatabase) {
  database.client.exec(CREATE_SEARCH_INDEX_SQL);
}

export function rebuildSearchIndex(database: AppDatabase) {
  ensureSearchIndex(database);

  database.client.prepare('DELETE FROM search_documents').run();

  const insertStatement = database.client.prepare(
    'INSERT INTO search_documents (doc_type, ref_id, name, symbol, api_symbol, categories) VALUES (?, ?, ?, ?, ?, ?)',
  );

  for (const coin of database.db.select().from(coins).all()) {
    insertStatement.run(
      'coin',
      coin.id,
      coin.name,
      coin.symbol,
      coin.apiSymbol,
      JSON.parse(coin.categoriesJson).join(' '),
    );
  }

  for (const category of database.db.select().from(categories).all()) {
    insertStatement.run('category', category.id, category.name, '', '', category.name);
  }
}

export function searchDocuments(database: AppDatabase, query: string, limit = 20) {
  ensureSearchIndex(database);

  const matchExpression = buildMatchExpression(query);

  if (!matchExpression) {
    return [];
  }

  const statement = database.client.prepare(`
    SELECT doc_type, ref_id, bm25(search_documents, 1.0, 2.0, 1.5, 0.75) AS rank
    FROM search_documents
    WHERE search_documents MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  return (statement.all(matchExpression, limit) as Array<{ doc_type: 'coin' | 'category'; ref_id: string; rank: number }>).map((row) => ({
    docType: row.doc_type,
    refId: row.ref_id,
    rank: row.rank,
  }));
}

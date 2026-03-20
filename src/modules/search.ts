import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppDatabase } from '../db/client';
import { searchDocuments } from '../db/search-index';
import { getCategories, getCoins, getMarketRows, parseJsonArray } from './catalog';

const searchQuerySchema = z.object({
  query: z.string().trim().min(1),
});

export function registerSearchRoutes(app: FastifyInstance, database: AppDatabase) {
  app.get('/search', async (request) => {
    const query = searchQuerySchema.parse(request.query).query.toLowerCase();
    const matches = searchDocuments(database, query, 20);
    const marketRows = getMarketRows(database, 'usd', { status: 'all' });
    const marketRowById = new Map(marketRows.map((row) => [row.coin.id, row]));
    const coinOrder = matches.filter((match) => match.docType === 'coin').map((match) => match.refId);
    const categoryOrder = matches.filter((match) => match.docType === 'category').map((match) => match.refId);
    const coinById = new Map(getCoins(database, { status: 'all' }).map((coin) => [coin.id, coin]));
    const categoryById = new Map(getCategories(database).map((category) => [category.id, category]));

    const coins = coinOrder
      .map((coinId) => coinById.get(coinId))
      .filter((coin): coin is NonNullable<typeof coin> => Boolean(coin))
      .slice(0, 10)
      .map((coin) => {
        const marketRow = marketRowById.get(coin.id);

        return {
          id: coin.id,
          name: coin.name,
          api_symbol: coin.apiSymbol,
          symbol: coin.symbol,
          market_cap_rank: coin.marketCapRank,
          thumb: coin.imageThumbUrl,
          large: coin.imageLargeUrl,
          categories: parseJsonArray<string>(coin.categoriesJson),
        };
      });

    const categories = categoryOrder
      .map((categoryId) => categoryById.get(categoryId))
      .filter((category): category is NonNullable<typeof category> => Boolean(category))
      .slice(0, 10)
      .map((category) => ({
        id: category.id,
        name: category.name,
      }));

    return {
      coins,
      exchanges: [],
      icos: [],
      categories,
      nfts: [],
    };
  });
}

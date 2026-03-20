import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/ping', async () => ({
    gecko_says: '(V3) To the Moon!',
  }));
}

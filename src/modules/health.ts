import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance) {
  const livenessPayload = async () => ({
    gecko_says: '(V3) To the Moon!',
  });

  app.get('/ping', livenessPayload);
  app.get('/health', livenessPayload);
}

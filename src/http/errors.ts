import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'invalid_request',
        details: error.flatten(),
      });
    }

    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    app.log.error(error);

    return reply.status(500).send({
      error: 'internal_server_error',
      message: 'An unexpected error occurred.',
    });
  });
}

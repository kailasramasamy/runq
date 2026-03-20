import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const fastifyError = error as { statusCode?: number; message?: string };
    if (fastifyError.statusCode === 401) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: fastifyError.message || 'Unauthorized',
      });
    }

    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : (error instanceof Error ? error.message : 'Unknown error'),
    });
  });
});

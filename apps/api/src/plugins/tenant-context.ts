import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

export const tenantContextPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('tenantId', '');

  app.addHook('preHandler', async (request: FastifyRequest) => {
    if (request.user?.tenantId) {
      request.tenantId = request.user.tenantId;
    }
  });
});

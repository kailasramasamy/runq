import { FastifyPluginAsync } from 'fastify';

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/wms', async (_request, reply) => {
    return reply.status(202).send({ data: { status: 'accepted' } });
  });
};

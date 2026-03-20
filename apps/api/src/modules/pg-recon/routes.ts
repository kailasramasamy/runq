import { FastifyPluginAsync } from 'fastify';

export const pgReconRoutes: FastifyPluginAsync = async (app) => {
  app.get('/settlements', async () => ({ data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 0 } }));
};

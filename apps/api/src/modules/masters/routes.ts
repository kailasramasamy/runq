import { FastifyPluginAsync } from 'fastify';
import { hsnSacRoutes } from './hsn-sac.routes';
import { itemRoutes } from './item.routes';

export const mastersRoutes: FastifyPluginAsync = async (app) => {
  await app.register(hsnSacRoutes, { prefix: '/hsn-sac' });
  await app.register(itemRoutes, { prefix: '/items' });
};

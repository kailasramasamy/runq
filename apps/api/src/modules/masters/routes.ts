import { FastifyPluginAsync } from 'fastify';
import { hsnSacRoutes } from './hsn-sac.routes';
import { itemRoutes } from './item.routes';
import { priceListRoutes } from './price-list.routes';
import { categoryRoutes } from './category.routes';

export const mastersRoutes: FastifyPluginAsync = async (app) => {
  await app.register(hsnSacRoutes, { prefix: '/hsn-sac' });
  await app.register(itemRoutes, { prefix: '/items' });
  await app.register(priceListRoutes, { prefix: '/price-lists' });
  await app.register(categoryRoutes, { prefix: '/categories' });
};

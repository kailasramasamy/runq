import { FastifyPluginAsync } from 'fastify';
import { hsnSacRoutes } from './hsn-sac.routes';

export const mastersRoutes: FastifyPluginAsync = async (app) => {
  await app.register(hsnSacRoutes, { prefix: '/hsn-sac' });
};

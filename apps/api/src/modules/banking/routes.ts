import { FastifyPluginAsync } from 'fastify';
import { bankAccountRoutes } from './bank-account.routes';
import { transactionRoutes } from './transaction.routes';
import { reconciliationRoutes } from './reconciliation.routes';
import { pettyCashRoutes } from './petty-cash.routes';

export const bankingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(bankAccountRoutes, { prefix: '/accounts' });
  await app.register(transactionRoutes, { prefix: '/accounts' });
  await app.register(reconciliationRoutes);
  await app.register(pettyCashRoutes, { prefix: '/petty-cash' });
};

import { FastifyPluginAsync } from 'fastify';
import { bankAccountRoutes } from './bank-account.routes';
import { transactionRoutes } from './transaction.routes';
import { reconciliationRoutes } from './reconciliation.routes';
import { pettyCashRoutes } from './petty-cash.routes';
import { chequeRoutes } from './cheque.routes';
import { statementImportRoutes } from './statement-import.routes';
import { pendingPaymentRoutes } from './pending-payment.routes';

export const bankingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(bankAccountRoutes, { prefix: '/accounts' });
  await app.register(transactionRoutes, { prefix: '/accounts' });
  await app.register(reconciliationRoutes);
  await app.register(pettyCashRoutes, { prefix: '/petty-cash' });
  await app.register(chequeRoutes, { prefix: '/cheques' });
  await app.register(statementImportRoutes, { prefix: '/statement-import' });
  await app.register(pendingPaymentRoutes, { prefix: '/pending-payments' });
};

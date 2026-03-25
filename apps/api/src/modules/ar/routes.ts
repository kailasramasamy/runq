import { FastifyPluginAsync } from 'fastify';
import { customerRoutes } from './customer.routes';
import { invoiceRoutes } from './invoice.routes';
import { receiptRoutes } from './receipt.routes';
import { creditNoteRoutes } from './credit-note.routes';
import { dunningRoutes } from './dunning.routes';
import { recurringRoutes } from './recurring.routes';

export const arRoutes: FastifyPluginAsync = async (app) => {
  await app.register(customerRoutes, { prefix: '/customers' });
  await app.register(invoiceRoutes, { prefix: '/invoices' });
  await app.register(receiptRoutes, { prefix: '/receipts' });
  await app.register(creditNoteRoutes, { prefix: '/credit-notes' });
  await app.register(dunningRoutes, { prefix: '/dunning' });
  await app.register(recurringRoutes, { prefix: '/recurring' });
};

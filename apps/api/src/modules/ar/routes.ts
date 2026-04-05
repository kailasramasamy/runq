import { FastifyPluginAsync } from 'fastify';
import { customerRoutes } from './customer.routes';
import { invoiceRoutes } from './invoice.routes';
import { receiptRoutes } from './receipt.routes';
import { creditNoteRoutes } from './credit-note.routes';
import { dunningRoutes } from './dunning.routes';
import { recurringRoutes } from './recurring.routes';
import { collectionRoutes } from './collection.routes';
import { quoteRoutes } from './quote.routes';
import { salesOrderRoutes } from './sales-order.routes';

export const arRoutes: FastifyPluginAsync = async (app) => {
  await app.register(customerRoutes, { prefix: '/customers' });
  await app.register(invoiceRoutes, { prefix: '/invoices' });
  await app.register(receiptRoutes, { prefix: '/receipts' });
  await app.register(creditNoteRoutes, { prefix: '/credit-notes' });
  await app.register(dunningRoutes, { prefix: '/dunning' });
  await app.register(recurringRoutes, { prefix: '/recurring' });
  await app.register(collectionRoutes, { prefix: '/collections' });
  await app.register(quoteRoutes, { prefix: '/quotes' });
  await app.register(salesOrderRoutes, { prefix: '/sales-orders' });
};

import { FastifyPluginAsync } from 'fastify';
import { vendorRoutes } from './vendor.routes';
import { debitNoteRoutes } from './debit-note.routes';
import { paymentRoutes } from './payment.routes';
import { purchaseInvoiceRoutes } from './purchase-invoice.routes';
import { paymentRunRoutes } from './payment-run.routes';
import { extractRoutes } from './extract.routes';
import { neftExportRoutes } from './neft-export.routes';

export const apRoutes: FastifyPluginAsync = async (app) => {
  // Vendor routes
  await app.register(vendorRoutes, { prefix: '/vendors' });

  // Debit note routes
  await app.register(debitNoteRoutes, { prefix: '/debit-notes' });

  // Payment routes
  await app.register(paymentRoutes, { prefix: '/payments' });

  // Purchase invoice routes
  await app.register(purchaseInvoiceRoutes, { prefix: '/purchase-invoices' });

  // AI invoice extraction routes
  await app.register(extractRoutes, { prefix: '/purchase-invoices' });

  // Payment run routes (replaces "payment queue" — see docs/payment-runs.md).
  // Both prefixes register the SAME handler so external integrations posting
  // to /payment-queue keep working.
  await app.register(paymentRunRoutes, { prefix: '/payment-runs' });
  await app.register(paymentRunRoutes, { prefix: '/payment-queue' });

  // NEFT/RTGS batch payment export
  await app.register(neftExportRoutes, { prefix: '/neft-export' });
};

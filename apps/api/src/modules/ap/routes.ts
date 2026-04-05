import { FastifyPluginAsync } from 'fastify';
import { vendorRoutes } from './vendor.routes';
import { debitNoteRoutes } from './debit-note.routes';
import { paymentRoutes } from './payment.routes';
import { purchaseInvoiceRoutes } from './purchase-invoice.routes';
import { paymentInstructionRoutes } from './payment-instruction.routes';
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

  // Payment instruction queue routes
  await app.register(paymentInstructionRoutes, { prefix: '/payment-queue' });

  // NEFT/RTGS batch payment export
  await app.register(neftExportRoutes, { prefix: '/neft-export' });
};

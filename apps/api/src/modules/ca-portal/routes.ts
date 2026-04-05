import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CAPortalService, verifyCAToken } from './ca-portal.service';
import {
  profitAndLossToCSV,
  balanceSheetToCSV,
  cashFlowToCSV,
  trialBalanceToCSV,
  journalEntriesToCSV,
  invoiceRegisterToCSV,
} from '../reports/csv-export';

const slugParamSchema = z.object({ slug: z.string().min(1) });
const periodQuerySchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
});
const balanceSheetQuerySchema = z.object({
  asOfDate: z.string().date().optional(),
});

async function resolveTenantId(
  db: import('@runq/db').Db,
  opts: { slug?: string; token?: string },
): Promise<string> {
  if (opts.slug) {
    const svc = new CAPortalService(db, '');
    return svc.resolveSlug(opts.slug);
  }
  if (opts.token) {
    const payload = verifyCAToken(opts.token);
    return payload.tenantId;
  }
  throw new Error('Missing slug or token');
}

export const caPortalRoutes: FastifyPluginAsync = async (app) => {
  // --- Slug-based routes ---

  app.get('/ca/s/:slug/info', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getCompanyInfo() };
  });

  app.get('/ca/s/:slug/profit-and-loss', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getProfitAndLoss(dateFrom, dateTo) };
  });

  app.get('/ca/s/:slug/balance-sheet', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { asOfDate } = balanceSheetQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getBalanceSheet(asOfDate) };
  });

  app.get('/ca/s/:slug/cash-flow', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getCashFlow(dateFrom, dateTo) };
  });

  app.get('/ca/s/:slug/trial-balance', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { asOfDate } = balanceSheetQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getTrialBalance(asOfDate) };
  });

  app.get('/ca/s/:slug/journal-entries', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getJournalEntries(dateFrom, dateTo) };
  });

  app.get('/ca/s/:slug/sales-register', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getSalesRegister(dateFrom, dateTo) };
  });

  app.get('/ca/s/:slug/purchase-register', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    return { data: await svc.getPurchaseRegister(dateFrom, dateTo) };
  });

  // --- CSV Exports ---

  app.get('/ca/s/:slug/export/profit-and-loss.csv', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const data = await svc.getProfitAndLoss(dateFrom, dateTo);
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="pnl-${dateFrom}-${dateTo}.csv"`).send(profitAndLossToCSV(data));
  });

  app.get('/ca/s/:slug/export/balance-sheet.csv', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { asOfDate } = balanceSheetQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const date = asOfDate || new Date().toISOString().slice(0, 10);
    const data = await svc.getBalanceSheet(date);
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="balance-sheet-${date}.csv"`).send(balanceSheetToCSV(data));
  });

  app.get('/ca/s/:slug/export/cash-flow.csv', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const data = await svc.getCashFlow(dateFrom, dateTo);
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="cash-flow-${dateFrom}-${dateTo}.csv"`).send(cashFlowToCSV(data));
  });

  app.get('/ca/s/:slug/export/trial-balance.csv', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { asOfDate } = balanceSheetQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const date = asOfDate || new Date().toISOString().slice(0, 10);
    const data = await svc.getTrialBalance(date);
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="trial-balance-${date}.csv"`).send(trialBalanceToCSV(data.accounts, data.asOfDate, data.totalDebit, data.totalCredit));
  });

  app.get('/ca/s/:slug/export/journal-entries.csv', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const data = await svc.getJournalEntries(dateFrom, dateTo);
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="journal-entries-${dateFrom}-${dateTo}.csv"`).send(journalEntriesToCSV(data));
  });

  app.get('/ca/s/:slug/export/sales-register.csv', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const data = await svc.getSalesRegister(dateFrom, dateTo);
    const csv = invoiceRegisterToCSV(data.map((r) => ({ ...r, partyName: r.customerName })), 'Sales');
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="sales-register-${dateFrom}-${dateTo}.csv"`).send(csv);
  });

  app.get('/ca/s/:slug/export/purchase-register.csv', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const data = await svc.getPurchaseRegister(dateFrom, dateTo);
    const csv = invoiceRegisterToCSV(data.map((r) => ({ ...r, partyName: r.vendorName })), 'Purchase');
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', `attachment; filename="purchase-register-${dateFrom}-${dateTo}.csv"`).send(csv);
  });

  // --- Tally Export ---

  app.get('/ca/s/:slug/export/tally-vouchers', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { dateFrom, dateTo } = periodQuerySchema.parse(request.query);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const xml = await svc.exportTallyVouchers(dateFrom, dateTo);
    return reply
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', `attachment; filename="tally-vouchers-${dateFrom}-${dateTo}.xml"`)
      .send(xml);
  });

  app.get('/ca/s/:slug/export/tally-ledgers', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params);
    const tenantId = await resolveTenantId(request.server.db, { slug });
    const svc = new CAPortalService(request.server.db, tenantId);
    const xml = await svc.exportTallyLedgers();
    return reply
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', 'attachment; filename="tally-ledgers.xml"')
      .send(xml);
  });
};

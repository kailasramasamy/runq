import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CAPortalService, verifyCAToken } from './ca-portal.service';

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

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PortalService } from './portal.service';
import { generateUPILink } from '../../utils/upi/upi-link';
import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';

const tokenQuerySchema = z.object({ token: z.string().min(1) });
const slugParamSchema = z.object({ slug: z.string().min(1) });

async function resolvePortalContext(
  db: import('@runq/db').Db,
  opts: { slug?: string; token?: string },
): Promise<{ tenantId: string; customerId: string }> {
  if (opts.slug) {
    const service = new PortalService(db, '');
    return service.resolveSlug(opts.slug);
  }
  if (opts.token) {
    const payload = PortalService.verifyToken(opts.token);
    return { tenantId: payload.tenantId, customerId: payload.customerId };
  }
  throw new Error('Missing slug or token');
}

async function buildInvoiceResponse(
  db: import('@runq/db').Db,
  tenantId: string,
  customerId: string,
) {
  const service = new PortalService(db, tenantId);
  const [companyName, customerName, invoices] = await Promise.all([
    service.getCompanyName(),
    service.getCustomerName(customerId),
    service.getOutstandingInvoices(customerId),
  ]);

  const upiId = await getUpiId(db, tenantId);
  const data = invoices.map((inv) => ({
    ...inv,
    upiLink: upiId
      ? generateUPILink({
          upiId,
          payeeName: companyName,
          amount: inv.balanceDue,
          transactionNote: `Payment for ${inv.invoiceNumber}`,
        })
      : null,
  }));

  return { companyName, customerName, data };
}

export const portalRoutes: FastifyPluginAsync = async (app) => {
  // Slug-based routes
  app.get('/portal/s/:slug/invoices', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { slug });
    return buildInvoiceResponse(request.server.db, tenantId, customerId);
  });

  app.get('/portal/s/:slug/history', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { slug });
    const service = new PortalService(request.server.db, tenantId);
    const [companyName, history] = await Promise.all([
      service.getCompanyName(),
      service.getPaymentHistory(customerId),
    ]);
    return { companyName, data: history };
  });

  // Legacy token-based routes
  app.get('/portal/invoices', async (request) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    return buildInvoiceResponse(request.server.db, tenantId, customerId);
  });

  app.get('/portal/history', async (request) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const { tenantId, customerId } = await resolvePortalContext(request.server.db, { token });
    const service = new PortalService(request.server.db, tenantId);
    const [companyName, history] = await Promise.all([
      service.getCompanyName(),
      service.getPaymentHistory(customerId),
    ]);
    return { companyName, data: history };
  });
};

async function getUpiId(db: import('@runq/db').Db, tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  return (settings.upiId as string) ?? null;
}

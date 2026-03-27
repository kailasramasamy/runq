import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PortalService } from './portal.service';
import { generateUPILink } from '../../utils/upi/upi-link';
import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';

const tokenQuerySchema = z.object({ token: z.string().min(1) });

export const portalRoutes: FastifyPluginAsync = async (app) => {
  app.get('/portal/invoices', async (request) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const payload = PortalService.verifyToken(token);
    const service = new PortalService(request.server.db, payload.tenantId);

    const [companyName, customerName, invoices] = await Promise.all([
      service.getCompanyName(),
      service.getCustomerName(payload.customerId),
      service.getOutstandingInvoices(payload.customerId),
    ]);

    const upiId = await getUpiId(request.server.db, payload.tenantId);

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
  });

  app.get('/portal/history', async (request) => {
    const { token } = tokenQuerySchema.parse(request.query);
    const payload = PortalService.verifyToken(token);
    const service = new PortalService(request.server.db, payload.tenantId);

    const [companyName, history] = await Promise.all([
      service.getCompanyName(),
      service.getPaymentHistory(payload.customerId),
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

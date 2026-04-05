import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { VendorPortalService } from './vendor-portal.service';

const slugParamSchema = z.object({ slug: z.string().min(1) });

async function resolveVendorContext(
  db: import('@runq/db').Db,
  slug: string,
): Promise<{ tenantId: string; vendorId: string }> {
  const service = new VendorPortalService(db, '');
  return service.resolveSlug(slug);
}

export const vendorPortalRoutes: FastifyPluginAsync = async (app) => {
  app.get('/vendor-portal/s/:slug/info', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, vendorId } = await resolveVendorContext(request.server.db, slug);
    const service = new VendorPortalService(request.server.db, tenantId);
    const [companyName, vendorName] = await Promise.all([
      service.getCompanyName(),
      service.getVendorName(vendorId),
    ]);
    return { companyName, vendorName };
  });

  app.get('/vendor-portal/s/:slug/purchase-orders', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, vendorId } = await resolveVendorContext(request.server.db, slug);
    const service = new VendorPortalService(request.server.db, tenantId);
    const [companyName, data] = await Promise.all([
      service.getCompanyName(),
      service.getPurchaseOrders(vendorId),
    ]);
    return { companyName, data };
  });

  app.get('/vendor-portal/s/:slug/bills', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, vendorId } = await resolveVendorContext(request.server.db, slug);
    const service = new VendorPortalService(request.server.db, tenantId);
    const [companyName, data] = await Promise.all([
      service.getCompanyName(),
      service.getOutstandingBills(vendorId),
    ]);
    return { companyName, data };
  });

  app.get('/vendor-portal/s/:slug/payments', async (request) => {
    const { slug } = slugParamSchema.parse(request.params);
    const { tenantId, vendorId } = await resolveVendorContext(request.server.db, slug);
    const service = new VendorPortalService(request.server.db, tenantId);
    const [companyName, data] = await Promise.all([
      service.getCompanyName(),
      service.getPaymentHistory(vendorId),
    ]);
    return { companyName, data };
  });
};

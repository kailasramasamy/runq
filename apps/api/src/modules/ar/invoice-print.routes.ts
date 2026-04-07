import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { InvoiceService } from './invoice.service';
import { renderInvoiceHTML } from './invoice-template';

const printParamSchema = z.object({ id: z.string().uuid() });
const tenantQuerySchema = z.object({ tenantId: z.string().uuid().optional() });

export const invoicePrintRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:id/print', async (request, reply) => {
    const { id } = printParamSchema.parse(request.params);
    const { tenantId: queryTenantId } = tenantQuerySchema.parse(request.query);

    // Use authenticated user's tenantId if available, fall back to query param for portal links
    const tenantId = request.user?.tenantId ?? queryTenantId;
    if (!tenantId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const service = new InvoiceService(request.server.db, tenantId);
    const { invoice, items, customer, tenant } = await service.getForPrint(id);

    // Verify the invoice belongs to this tenant
    if (invoice.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    const tenantInfo = { ...tenant, settings: (tenant.settings ?? {}) as Record<string, unknown> };
    const html = renderInvoiceHTML(invoice, items, customer, tenantInfo);
    return reply.type('text/html').send(html);
  });
};

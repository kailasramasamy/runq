import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { InvoiceService } from './invoice.service';
import { renderInvoiceHTML } from './invoice-template';

const printParamSchema = z.object({ id: z.string().uuid() });
const tenantQuerySchema = z.object({ tenantId: z.string().uuid() });

export const invoicePrintRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:id/print', async (request, reply) => {
    const { id } = printParamSchema.parse(request.params);
    const { tenantId } = tenantQuerySchema.parse(request.query);

    const service = new InvoiceService(request.server.db, tenantId);
    const { invoice, items, customer, tenant } = await service.getForPrint(id);

    const tenantInfo = { ...tenant, settings: (tenant.settings ?? {}) as Record<string, unknown> };
    const html = renderInvoiceHTML(invoice, items, customer, tenantInfo);
    return reply.type('text/html').send(html);
  });
};

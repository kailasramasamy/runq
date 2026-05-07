import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateBillSyncSource } from './source.service';
import { BillSyncIngestService, type IngestPayload } from './ingest.service';

const lineSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  amount: z.number(),
  hsnSacCode: z.string().optional(),
  taxRate: z.number().optional(),
});

const billSchema = z.object({
  externalId: z.string().min(1).max(255),
  version: z.number().int().min(1),
  vendor: z.object({
    externalRef: z.string().optional(),
    gstin: z.string().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
  }).refine((v) => v.externalRef || v.gstin || v.phone || v.name, {
    message: 'vendor must include at least one of externalRef, gstin, phone, name',
  }),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(lineSchema).min(1),
  subtotal: z.number(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  notes: z.string().optional(),
});

/**
 * Public push API — authenticated by source slug + API key in headers, NOT
 * by user session. Tenant context is derived from the matched source row,
 * which is why this plugin is registered outside the user-auth scope.
 */
export const billSyncPushRoutes: FastifyPluginAsync = async (app) => {
  app.post('/bills', async (request, reply) => {
    const slug = String(request.headers['x-source-slug'] ?? '');
    const apiKey = String(request.headers['x-api-key'] ?? '');
    const source = await authenticateBillSyncSource(request.server.db, slug, apiKey);
    if (!source) return reply.status(401).send({ error: 'invalid_source_credentials' });

    const parsed = billSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_payload', details: parsed.error.issues });

    const ingest = new BillSyncIngestService(request.server.db, source.tenantId);
    const result = await ingest.ingestBill(source.id, source.slug, parsed.data as IngestPayload);
    const status = result.status === 'rejected' ? 409
      : result.status === 'created' ? 201
      : 200;
    return reply.status(status).send({ data: result });
  });
};

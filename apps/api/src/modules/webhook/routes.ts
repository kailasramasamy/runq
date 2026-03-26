import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { VendorService } from '../ap/vendor.service';
import { WebhookService } from './webhook.service';
import { handlePoCreated } from './handlers/po.handler';
import { handleGrnCreated } from './handlers/grn.handler';
import { handlePurchaseInvoiceCreated } from './handlers/purchase-invoice.handler';
import { handleSalesInvoiceCreated } from './handlers/sales-invoice.handler';

// Generic webhook envelope — all events use this format
const webhookEnvelopeSchema = z.object({
  eventType: z.string(),
  eventId: z.string().min(1),
  timestamp: z.string().optional(),
  tenantId: z.string().uuid(),
  payload: z.record(z.unknown()),
});

// Legacy vendor format (backward compat)
const legacyVendorSchema = z.object({
  event: z.enum(['vendor.created', 'vendor.updated']),
  tenantId: z.string().uuid(),
  vendor: z.object({
    wmsVendorId: z.string(),
    name: z.string(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    gstin: z.string().nullish(),
    pan: z.string().nullish(),
    bankAccountNumber: z.string().nullish(),
    bankIfsc: z.string().nullish(),
    bankName: z.string().nullish(),
    category: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    pincode: z.string().nullish(),
    paymentTermsDays: z.number().int().min(0).max(365).optional(),
  }),
});

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/wms', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Try legacy vendor format first (backward compat)
    if ('event' in body && 'vendor' in body) {
      return handleLegacyVendor(request.server.db, body, reply);
    }

    // Parse generic envelope
    const parsed = webhookEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid webhook payload', details: parsed.error.issues });
    }

    const { eventType, eventId, tenantId, payload } = parsed.data;
    const db = request.server.db;
    const webhookService = new WebhookService(db);

    // Dedup check
    const isDup = await webhookService.isDuplicate(eventId, tenantId);
    if (isDup) {
      return reply.status(202).send({ data: { status: 'duplicate', eventId } });
    }

    // Log the event
    const mappedEventType = mapEventType(eventType);
    await webhookService.logReceived(eventId, tenantId, mappedEventType, payload);

    try {
      const entityId = await routeEvent(db, tenantId, eventType, payload);
      await webhookService.markProcessed(eventId, tenantId);
      return reply.status(202).send({ data: { status: 'processed', eventId, entityId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await webhookService.markFailed(eventId, tenantId, message);
      app.log.error({ eventType, eventId, err }, 'Webhook handler failed');
      return reply.status(422).send({ error: message, eventId });
    }
  });
};

async function routeEvent(
  db: Parameters<typeof handlePoCreated>[0],
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<string> {
  switch (eventType) {
    case 'vendor.created':
    case 'vendor.updated':
      return handleVendorEvent(db, tenantId, payload);
    case 'po.created':
      return handlePoCreated(db, tenantId, payload as any);
    case 'grn.created':
      return handleGrnCreated(db, tenantId, payload as any);
    case 'purchase_invoice.created':
      return handlePurchaseInvoiceCreated(db, tenantId, payload as any);
    case 'sales_invoice.created':
      return handleSalesInvoiceCreated(db, tenantId, payload as any);
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}

async function handleVendorEvent(
  db: Parameters<typeof handlePoCreated>[0],
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const vendor = payload as any;
  const service = new VendorService(db, tenantId);
  const { vendor: result } = await service.syncVendor({
    name: vendor.name,
    wmsVendorId: vendor.wmsVendorId,
    phone: vendor.phone ?? undefined,
    email: vendor.email ?? undefined,
    gstin: vendor.gstin ?? undefined,
    pan: vendor.pan ?? undefined,
    bankAccountNumber: vendor.bankAccountNumber ?? undefined,
    bankIfsc: vendor.bankIfsc ?? undefined,
    bankName: vendor.bankName ?? undefined,
    category: vendor.category ?? undefined,
    city: vendor.city ?? undefined,
    state: vendor.state ?? undefined,
    pincode: vendor.pincode ?? undefined,
    paymentTermsDays: vendor.paymentTermsDays ?? 30,
  });
  return result.id;
}

async function handleLegacyVendor(
  db: Parameters<typeof handlePoCreated>[0],
  body: Record<string, unknown>,
  reply: any,
) {
  const parsed = legacyVendorSchema.safeParse(body);
  if (!parsed.success) {
    return reply.status(202).send({ data: { status: 'accepted' } });
  }

  const { tenantId, vendor } = parsed.data;
  const service = new VendorService(db, tenantId);
  await service.syncVendor({
    name: vendor.name,
    wmsVendorId: vendor.wmsVendorId,
    phone: vendor.phone ?? undefined,
    email: vendor.email ?? undefined,
    gstin: vendor.gstin ?? undefined,
    pan: vendor.pan ?? undefined,
    bankAccountNumber: vendor.bankAccountNumber ?? undefined,
    bankIfsc: vendor.bankIfsc ?? undefined,
    bankName: vendor.bankName ?? undefined,
    category: vendor.category ?? undefined,
    city: vendor.city ?? undefined,
    state: vendor.state ?? undefined,
    pincode: vendor.pincode ?? undefined,
    paymentTermsDays: vendor.paymentTermsDays ?? 30,
  });
  return reply.status(202).send({ data: { status: 'accepted' } });
}

function mapEventType(eventType: string) {
  // Map to DB enum values
  const mapped: Record<string, any> = {
    'vendor.created': 'vendor.created',
    'vendor.updated': 'vendor.updated',
    'po.created': 'po.created',
    'grn.created': 'grn.created',
    'purchase_invoice.created': 'purchase_invoice.created',
    'sales_invoice.created': 'sales_invoice.created',
  };
  return mapped[eventType] ?? 'invoice.created';
}

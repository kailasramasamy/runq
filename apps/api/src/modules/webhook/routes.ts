import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { VendorService } from '../ap/vendor.service';

const wmsVendorPayloadSchema = z.object({
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
    const parsed = wmsVendorPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(202).send({ data: { status: 'accepted' } });
    }

    const { tenantId, vendor } = parsed.data;
    const service = new VendorService(request.server.db, tenantId);

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
  });
};

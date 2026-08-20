import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticatePartner, touchPartnerKey } from './key.service';
import { PartnerMilkQualityService } from './milk-quality.service';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WINDOW_DAYS = 31;

const querySchema = z.object({
  from: z.string().regex(DAY),
  to: z.string().regex(DAY),
}).refine((q) => q.from <= q.to, { message: 'from must not be after to' });

/**
 * Outbound partner read API — authenticated by slug + API key headers, not by
 * a user session, so it is registered outside the user-auth scope. The matched
 * key row supplies the tenant; no tenant is ever accepted from the caller.
 */
export const partnerApiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/milk-quality/daily', async (request, reply) => {
    const slug = String(request.headers['x-partner-slug'] ?? '');
    const apiKey = String(request.headers['x-api-key'] ?? '');
    const key = await authenticatePartner(request.server.db, slug, apiKey, 'mp:milk-quality:read');
    if (!key) return reply.status(401).send({ error: 'invalid_partner_credentials' });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query', details: parsed.error.issues });
    }
    const { from, to } = parsed.data;
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (span > MAX_WINDOW_DAYS) {
      return reply.status(400).send({ error: 'window_too_large', maxDays: MAX_WINDOW_DAYS });
    }

    const days = await new PartnerMilkQualityService(request.server.db, key.tenantId).daily(from, to);
    // Usage stamping is bookkeeping — a failed write must not fail the read.
    touchPartnerKey(request.server.db, key.id).catch((err) => {
      request.log.warn({ err, keyId: key.id }, 'partner key touch failed');
    });
    return reply.send({ days });
  });
};

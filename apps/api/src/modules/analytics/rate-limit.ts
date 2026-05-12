import type { FastifyRequest } from 'fastify';
import type { RateLimitPluginOptions } from '@fastify/rate-limit';

// 60/min/tenant. A single analytics-page load fires ~10 rate-limited calls;
// React strict mode (dev) doubles to ~20; small headroom for legitimate user
// refresh / drill-down. Lower this if a heavier compute endpoint is added.
export const HEAVY_REPORT_RATE_LIMIT: RateLimitPluginOptions = {
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req: FastifyRequest) => {
    const tenantId = (req as unknown as { tenantId?: string }).tenantId;
    return tenantId ? `tenant:${tenantId}` : (req.ip || 'anon');
  },
};

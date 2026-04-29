import { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';

export const observabilityRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  // Platform-wide health snapshot. Numbers come from DB aggregations —
  // no APM hookup yet, so we surface what we *can* measure: extraction
  // success, recon health, queue-style backlog signals.
  app.get('/observability/snapshot', async () => {
    const [aiSuccess] = (
      await app.db.execute<{ ok: number; total: number }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'parsed')::int AS ok,
          COUNT(*)::int AS total
        FROM po_uploads
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `)
    ).rows;

    const [reconBacklog] = (
      await app.db.execute<{ unmatched: number }>(sql`
        SELECT COUNT(*)::int AS unmatched
        FROM bank_transactions bt
        WHERE bt.recon_status = 'unreconciled'
          AND bt.transaction_date >= NOW() - INTERVAL '30 days'
      `)
    ).rows;

    const [activeTenants] = (
      await app.db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM tenants
        WHERE deleted_at IS NULL AND status = 'active'
      `)
    ).rows;

    const [staleTenants] = (
      await app.db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM tenants
        WHERE deleted_at IS NULL
          AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '14 days')
          AND status IN ('active', 'trial')
      `)
    ).rows;

    return {
      data: {
        aiExtractionSuccessRate: aiSuccess && aiSuccess.total > 0 ? Math.round((aiSuccess.ok / aiSuccess.total) * 100) : null,
        aiExtractionSamples: aiSuccess?.total ?? 0,
        reconBacklog30d: reconBacklog?.unmatched ?? 0,
        activeTenants: activeTenants?.count ?? 0,
        staleTenants14d: staleTenants?.count ?? 0,
        timestamp: new Date().toISOString(),
      },
    };
  });

  // At-risk tenants: paying customers who haven't logged in recently.
  app.get('/observability/at-risk', async () => {
    const rows = (
      await app.db.execute<{
        id: string;
        name: string;
        slug: string;
        status: string;
        mrr_cents: number;
        last_active_at: string | null;
        days_inactive: number;
      }>(sql`
        SELECT id, name, slug, status, mrr_cents, last_active_at,
               EXTRACT(DAY FROM NOW() - COALESCE(last_active_at, created_at))::int AS days_inactive
        FROM tenants
        WHERE deleted_at IS NULL
          AND status IN ('active', 'trial')
          AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '7 days')
        ORDER BY days_inactive DESC NULLS FIRST, mrr_cents DESC
        LIMIT 50
      `)
    ).rows;

    return { data: rows };
  });
};

import { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  // Activation funnel — counts at each stage.
  app.get('/analytics/funnel', async () => {
    const result = await app.db.execute<{ stage: string; count: number }>(sql`
      WITH base AS (
        SELECT id FROM tenants WHERE deleted_at IS NULL
      )
      SELECT 'signed_up' AS stage, COUNT(*)::int AS count FROM base
      UNION ALL
      SELECT 'has_user' AS stage, COUNT(DISTINCT u.tenant_id)::int FROM users u JOIN base b ON b.id = u.tenant_id
      UNION ALL
      SELECT 'has_invoice' AS stage, COUNT(DISTINCT i.tenant_id)::int FROM sales_invoices i JOIN base b ON b.id = i.tenant_id
      UNION ALL
      SELECT 'paying' AS stage, COUNT(DISTINCT t.id)::int FROM tenants t JOIN base b ON b.id = t.id
        WHERE t.status = 'active' AND t.mrr_cents > 0
    `);

    return { data: result.rows };
  });

  // Module activation: % of tenants who have used each module recently.
  app.get('/analytics/modules', async () => {
    const result = await app.db.execute<{ module: string; tenants: number }>(sql`
      SELECT 'ar' AS module, COUNT(DISTINCT tenant_id)::int AS tenants FROM sales_invoices
      UNION ALL
      SELECT 'ap' AS module, COUNT(DISTINCT tenant_id)::int FROM purchase_invoices
      UNION ALL
      SELECT 'banking' AS module, COUNT(DISTINCT tenant_id)::int FROM bank_accounts
      UNION ALL
      SELECT 'gst' AS module, COUNT(DISTINCT tenant_id)::int FROM gst_returns
      UNION ALL
      SELECT 'fa' AS module, COUNT(DISTINCT tenant_id)::int FROM fixed_assets
    `);

    return { data: result.rows };
  });

  // Signup trend by month.
  app.get('/analytics/signups', async () => {
    const result = await app.db.execute<{ month: string; signups: number }>(sql`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             COUNT(*)::int AS signups
      FROM tenants
      WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return { data: result.rows };
  });
};

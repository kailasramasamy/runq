import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, isNull, or, sql, SQL } from 'drizzle-orm';
import { plans, subscriptions, platformInvoices, paymentEvents, tenants } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { logPlatformAction } from './audit.service';

const planUpsertSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  priceCents: z.number().int().min(0),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
  modules: z.array(z.string()).default([]),
  features: z.record(z.unknown()).default({}),
  razorpayPlanId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const invoiceListSchema = z.object({
  tenantId: z.string().uuid().optional(),
  status: z.enum(['draft', 'issued', 'paid', 'failed', 'refunded', 'cancelled']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const invoicePatchSchema = z.object({
  status: z.enum(['draft', 'issued', 'paid', 'failed', 'refunded', 'cancelled']).optional(),
  notes: z.string().nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
});

export const billingAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  // ── Plans ────────────────────────────────────────────────────────────
  app.get('/plans', async () => {
    const rows = await app.db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.priceCents));
    return { data: rows };
  });

  app.post(
    '/plans',
    { preHandler: [app.requirePlatformRole('super_admin', 'billing_ops')] },
    async (request) => {
      const input = planUpsertSchema.parse(request.body);
      const [created] = await app.db.insert(plans).values(input).returning();
      await logPlatformAction(app, request, {
        action: 'plan.create',
        targetType: 'plan',
        targetId: created.id,
        metadata: { code: created.code },
      });
      return { data: created };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/plans/:id',
    { preHandler: [app.requirePlatformRole('super_admin', 'billing_ops')] },
    async (request) => {
      const { id } = request.params;
      const input = planUpsertSchema.partial().parse(request.body);
      const [updated] = await app.db
        .update(plans)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(plans.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Plan not found');
      await logPlatformAction(app, request, {
        action: 'plan.update',
        targetType: 'plan',
        targetId: id,
        metadata: { changes: input },
      });
      return { data: updated };
    },
  );

  // ── Subscriptions ────────────────────────────────────────────────────
  app.get('/subscriptions', async (request) => {
    const q = z
      .object({
        tenantId: z.string().uuid().optional(),
        status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'expired']).optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
        offset: z.coerce.number().min(0).default(0),
      })
      .parse(request.query);

    const where: SQL[] = [];
    if (q.tenantId) where.push(eq(subscriptions.tenantId, q.tenantId));
    if (q.status) where.push(eq(subscriptions.status, q.status));
    const whereClause = where.length ? and(...where) : undefined;

    const rows = await app.db
      .select({
        id: subscriptions.id,
        tenantId: subscriptions.tenantId,
        tenantName: tenants.name,
        planId: subscriptions.planId,
        planName: plans.name,
        status: subscriptions.status,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAt: subscriptions.cancelAt,
        razorpaySubscriptionId: subscriptions.razorpaySubscriptionId,
      })
      .from(subscriptions)
      .leftJoin(tenants, eq(tenants.id, subscriptions.tenantId))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(whereClause)
      .orderBy(desc(subscriptions.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const [{ count }] = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(whereClause);

    return { data: { rows, total: count, limit: q.limit, offset: q.offset } };
  });

  // ── Manually attach / change a tenant's subscription ─────────────────
  // One subscription per tenant. This upserts; downstream Razorpay webhook
  // (when wired) will update the same row by tenant_id.
  const upsertSubscriptionSchema = z.object({
    planId: z.string().uuid(),
    status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'expired']).default('active'),
    currentPeriodStart: z.string().datetime().nullable().optional(),
    currentPeriodEnd: z.string().datetime().nullable().optional(),
    razorpaySubscriptionId: z.string().nullable().optional(),
  });

  app.put<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/subscription',
    { preHandler: [app.requirePlatformRole('super_admin', 'billing_ops')] },
    async (request) => {
      const { tenantId } = request.params;
      const input = upsertSubscriptionSchema.parse(request.body);

      const [tenant] = await app.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw new NotFoundError('Tenant not found');

      const [plan] = await app.db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
      if (!plan) throw new NotFoundError('Plan not found');

      const periodStart = input.currentPeriodStart ? new Date(input.currentPeriodStart) : new Date();
      const periodEnd = input.currentPeriodEnd
        ? new Date(input.currentPeriodEnd)
        : new Date(periodStart.getTime() + (plan.interval === 'yearly' ? 365 : 30) * 86_400_000);

      const [existing] = await app.db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);

      let result;
      if (existing) {
        [result] = await app.db
          .update(subscriptions)
          .set({
            planId: input.planId,
            status: input.status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            razorpaySubscriptionId: input.razorpaySubscriptionId ?? existing.razorpaySubscriptionId,
            cancelledAt: input.status === 'cancelled' ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, existing.id))
          .returning();
      } else {
        [result] = await app.db
          .insert(subscriptions)
          .values({
            tenantId,
            planId: input.planId,
            status: input.status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            razorpaySubscriptionId: input.razorpaySubscriptionId ?? null,
            cancelledAt: input.status === 'cancelled' ? new Date() : null,
          })
          .returning();
      }

      // Sync the tenant: set plan_id and mrr_cents (only counts when subscription is paying-ish).
      const isPaying = input.status === 'active' || input.status === 'past_due';
      const monthlyCents = plan.interval === 'yearly' ? Math.round(plan.priceCents / 12) : plan.priceCents;
      await app.db
        .update(tenants)
        .set({
          planId: input.planId,
          mrrCents: isPaying ? monthlyCents : 0,
          status: input.status === 'cancelled' || input.status === 'expired' ? 'churned' : input.status === 'trialing' ? 'trial' : 'active',
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));

      await logPlatformAction(app, request, {
        action: existing ? 'subscription.update' : 'subscription.attach',
        targetType: 'subscription',
        targetId: result.id,
        targetTenantId: tenantId,
        metadata: { planCode: plan.code, status: input.status },
      });

      return { data: result };
    },
  );

  // Cancel a subscription (sets status=cancelled, zeroes MRR).
  app.delete<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/subscription',
    { preHandler: [app.requirePlatformRole('super_admin', 'billing_ops')] },
    async (request) => {
      const { tenantId } = request.params;
      const [existing] = await app.db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);
      if (!existing) throw new NotFoundError('No subscription to cancel');

      const [updated] = await app.db
        .update(subscriptions)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.id, existing.id))
        .returning();

      await app.db
        .update(tenants)
        .set({ mrrCents: 0, status: 'churned', updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      await logPlatformAction(app, request, {
        action: 'subscription.cancel',
        targetType: 'subscription',
        targetId: existing.id,
        targetTenantId: tenantId,
      });

      return { data: updated };
    },
  );

  // Get the current subscription for a tenant (used by the detail page).
  app.get<{ Params: { tenantId: string } }>('/tenants/:tenantId/subscription', async (request) => {
    const { tenantId } = request.params;
    const [row] = await app.db
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        planName: plans.name,
        planCode: plans.code,
        priceCents: plans.priceCents,
        interval: plans.interval,
        status: subscriptions.status,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelledAt: subscriptions.cancelledAt,
        razorpaySubscriptionId: subscriptions.razorpaySubscriptionId,
      })
      .from(subscriptions)
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);

    return { data: row ?? null };
  });

  // ── Invoices ─────────────────────────────────────────────────────────
  app.get('/invoices', async (request) => {
    const q = invoiceListSchema.parse(request.query);

    const where: SQL[] = [];
    if (q.tenantId) where.push(eq(platformInvoices.tenantId, q.tenantId));
    if (q.status) where.push(eq(platformInvoices.status, q.status));
    if (q.search) where.push(ilike(platformInvoices.number, `%${q.search}%`));
    const whereClause = where.length ? and(...where) : undefined;

    const rows = await app.db
      .select({
        id: platformInvoices.id,
        tenantId: platformInvoices.tenantId,
        tenantName: tenants.name,
        number: platformInvoices.number,
        totalCents: platformInvoices.totalCents,
        status: platformInvoices.status,
        issuedAt: platformInvoices.issuedAt,
        dueAt: platformInvoices.dueAt,
        paidAt: platformInvoices.paidAt,
        createdAt: platformInvoices.createdAt,
      })
      .from(platformInvoices)
      .leftJoin(tenants, eq(tenants.id, platformInvoices.tenantId))
      .where(whereClause)
      .orderBy(desc(platformInvoices.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const [{ count }] = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(platformInvoices)
      .where(whereClause);

    return { data: { rows, total: count, limit: q.limit, offset: q.offset } };
  });

  app.patch<{ Params: { id: string } }>(
    '/invoices/:id',
    { preHandler: [app.requirePlatformRole('super_admin', 'billing_ops')] },
    async (request) => {
      const { id } = request.params;
      const input = invoicePatchSchema.parse(request.body);
      const updates: Record<string, unknown> = { ...input, updatedAt: new Date() };
      if (input.paidAt) updates.paidAt = new Date(input.paidAt);
      const [updated] = await app.db.update(platformInvoices).set(updates).where(eq(platformInvoices.id, id)).returning();
      if (!updated) throw new NotFoundError('Invoice not found');
      await logPlatformAction(app, request, {
        action: 'invoice.update',
        targetType: 'invoice',
        targetId: id,
        targetTenantId: updated.tenantId,
        metadata: { changes: input },
      });
      return { data: updated };
    },
  );

  // ── Overview metrics: MRR, ARR, active subs, churn30 ────────────────
  app.get('/overview', async () => {
    // MRR = sum of price_cents for active subscriptions on a monthly interval +
    //       sum of (price/12) for active yearly subs.
    const mrrRows = await app.db.execute<{ mrr_cents: number }>(sql`
      SELECT COALESCE(SUM(
        CASE WHEN p.interval = 'monthly' THEN p.price_cents
             WHEN p.interval = 'yearly' THEN p.price_cents / 12
             ELSE 0 END
      ), 0)::int AS mrr_cents
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.status IN ('active', 'past_due')
    `);
    const mrrCents = mrrRows.rows[0]?.mrr_cents ?? 0;

    const [{ activeSubs }] = await app.db
      .select({ activeSubs: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    const [{ trialingSubs }] = await app.db
      .select({ trialingSubs: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'trialing'));

    const churn30Rows = await app.db.execute<{ churned: number }>(sql`
      SELECT COUNT(*)::int AS churned
      FROM subscriptions
      WHERE status = 'cancelled' AND cancelled_at >= NOW() - INTERVAL '30 days'
    `);
    const churned30 = churn30Rows.rows[0]?.churned ?? 0;

    const [{ activeTenants }] = await app.db
      .select({ activeTenants: sql<number>`count(*)::int` })
      .from(tenants)
      .where(and(isNull(tenants.deletedAt), eq(tenants.status, 'active')));

    return {
      data: {
        mrrCents,
        arrCents: mrrCents * 12,
        activeSubs,
        trialingSubs,
        churned30,
        activeTenants,
      },
    };
  });

  // ── Payment events log (Razorpay webhook history) ────────────────────
  app.get('/payment-events', async (request) => {
    const q = z
      .object({
        tenantId: z.string().uuid().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
        offset: z.coerce.number().min(0).default(0),
      })
      .parse(request.query);

    const where: SQL[] = [];
    if (q.tenantId) where.push(eq(paymentEvents.tenantId, q.tenantId));
    const whereClause = where.length ? and(...where) : undefined;

    const rows = await app.db
      .select()
      .from(paymentEvents)
      .where(whereClause)
      .orderBy(desc(paymentEvents.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const [{ count }] = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentEvents)
      .where(whereClause);

    return { data: { rows, total: count, limit: q.limit, offset: q.offset } };
  });
};

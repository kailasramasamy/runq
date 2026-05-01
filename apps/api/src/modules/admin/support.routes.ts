/**
 * Platform-admin support routes (cross-tenant) — used by the runQ team to
 * triage escalated conversations from any tenant.
 */
import { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  supportConversations,
  supportMessages,
  supportAgentActions,
  tenants,
  users,
} from '@runq/db';
import { publishMessage } from '../support/realtime';

const adminReplySchema = z.object({
  message: z.string().min(1).max(8000),
});

/**
 * Derives a human-readable outcome from a conversation's lifecycle fields,
 * with no schema change. The status enum tracks workflow state; outcome
 * tracks how the conversation actually ended (or where it stands).
 */
type Outcome =
  | 'awaiting_user'      // agent answered, waiting on user — could resolve any time
  | 'awaiting_human'     // escalated, you need to reply
  | 'in_progress'        // user just sent, agent is processing
  | 'answered'           // resolved, agent solved it without escalation
  | 'resolved_by_human'  // resolved, a human admin replied at some point
  | 'resolved_by_user'   // user explicitly clicked "mark resolved"
  | 'auto_closed'        // closed via inactivity sweep
  | 'closed_by_admin';   // admin clicked Close

async function fetchAdminFirstMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  conversationIds: string[],
): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map();
  const result = await db.execute(sql`
    SELECT DISTINCT ON (conversation_id) conversation_id, content
    FROM support_messages
    WHERE conversation_id IN (${sql.join(conversationIds.map((id: string) => sql`${id}::uuid`), sql`, `)})
      AND role = 'user'
    ORDER BY conversation_id, created_at ASC
  `);
  const map = new Map<string, string>();
  for (const row of result.rows as Array<{ conversation_id: string; content: string }>) {
    map.set(row.conversation_id, row.content);
  }
  return map;
}

function deriveOutcome(conv: {
  status: string;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  assignedTo: string | null;
}): Outcome {
  const wasEscalated = !!conv.escalatedAt;
  const hadHumanReply = !!conv.assignedTo;

  switch (conv.status) {
    case 'open':
      return 'in_progress';
    case 'waiting_human':
      return 'awaiting_human';
    case 'agent_replied':
      return 'awaiting_user';
    case 'resolved':
      if (hadHumanReply) return 'resolved_by_human';
      if (wasEscalated) return 'resolved_by_human';   // escalation handled then resolved
      return 'resolved_by_user';
    case 'closed':
      if (hadHumanReply) return 'closed_by_admin';
      if (wasEscalated) return 'closed_by_admin';
      return 'auto_closed';
    default:
      return 'in_progress';
  }
}

export const adminSupportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  // ── Inbox: all conversations needing attention, across all tenants ──
  app.get(
    '/support/inbox',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const status = (request.query as { status?: string }).status ?? 'all';
      const baseQuery = app.db
        .select({
          id: supportConversations.id,
          subject: supportConversations.subject,
          status: supportConversations.status,
          lastMessageAt: supportConversations.lastMessageAt,
          createdAt: supportConversations.createdAt,
          escalatedAt: supportConversations.escalatedAt,
          resolvedAt: supportConversations.resolvedAt,
          assignedTo: supportConversations.assignedTo,
          agentSummary: supportConversations.agentSummary,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
          userEmail: users.email,
          userName: users.name,
        })
        .from(supportConversations)
        .innerJoin(tenants, eq(tenants.id, supportConversations.tenantId))
        .innerJoin(users, eq(users.id, supportConversations.userId));

      const rows = status === 'all'
        ? await baseQuery
            .orderBy(desc(supportConversations.lastMessageAt))
            .limit(200)
        : await baseQuery
            .where(eq(supportConversations.status, status as never))
            .orderBy(desc(supportConversations.escalatedAt), desc(supportConversations.lastMessageAt))
            .limit(200);

      // Attach first-user-message preview (per-conversation distinguisher)
      const previewMap = await fetchAdminFirstMessages(app.db, rows.map(r => r.id));

      const [counts] = await app.db
        .select({
          waiting: sql<number>`COUNT(*) FILTER (WHERE status = 'waiting_human')::int`,
          open: sql<number>`COUNT(*) FILTER (WHERE status = 'open')::int`,
          replied: sql<number>`COUNT(*) FILTER (WHERE status = 'agent_replied')::int`,
        })
        .from(supportConversations);

      const enriched = rows.map((r) => ({
        ...r,
        outcome: deriveOutcome(r),
        preview: previewMap.get(r.id) ?? null,
      }));
      return { data: { conversations: enriched, counts } };
    },
  );

  // ── Get one conversation with full message thread ────────────────────
  app.get<{ Params: { id: string } }>(
    '/support/conversations/:id',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request, reply) => {
      const [conv] = await app.db
        .select({
          conv: supportConversations,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
          userEmail: users.email,
          userName: users.name,
        })
        .from(supportConversations)
        .innerJoin(tenants, eq(tenants.id, supportConversations.tenantId))
        .innerJoin(users, eq(users.id, supportConversations.userId))
        .where(eq(supportConversations.id, request.params.id))
        .limit(1);
      if (!conv) return reply.code(404).send({ error: 'Not found' });

      const messages = await app.db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.conversationId, request.params.id))
        .orderBy(supportMessages.createdAt);

      return {
        data: {
          conversation: {
            ...conv.conv,
            tenantName: conv.tenantName,
            tenantSlug: conv.tenantSlug,
            userEmail: conv.userEmail,
            userName: conv.userName,
            outcome: deriveOutcome(conv.conv),
          },
          messages,
        },
      };
    },
  );

  // ── Human reply (bypasses agent on the user's next message) ──────────
  app.post<{ Params: { id: string } }>(
    '/support/conversations/:id/reply',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request, reply) => {
      const { message } = adminReplySchema.parse(request.body);
      const [conv] = await app.db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, request.params.id))
        .limit(1);
      if (!conv) return reply.code(404).send({ error: 'Not found' });

      await app.db.insert(supportMessages).values({
        conversationId: conv.id,
        role: 'human',
        content: message,
      });
      await app.db
        .update(supportConversations)
        .set({
          // Stay on waiting_human until the human explicitly closes or the
          // user responds — keeps the conversation visible in the inbox until
          // the issue is actually resolved.
          //
          // We do NOT set assigned_to here: the column FK-references the
          // tenant users table, but the responder is a platform_user. Track
          // the responder identity via the support_messages row itself
          // (role='human', plus content + timestamp) which is sufficient for
          // the inbox UX. If we ever need explicit per-admin assignment,
          // add a platform_user_id column.
          status: 'waiting_human',
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supportConversations.id, conv.id));
      publishMessage({
        type: 'message_added',
        conversationId: conv.id,
        tenantId: conv.tenantId,
        userId: conv.userId,
        role: 'human',
      });
      return { data: { sent: true } };
    },
  );

  // ── Close (resolved) ─────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/support/conversations/:id/close',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request, reply) => {
      const result = await app.db
        .update(supportConversations)
        .set({ status: 'closed', resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(supportConversations.id, request.params.id))
        .returning({ id: supportConversations.id });
      if (result.length === 0) return reply.code(404).send({ error: 'Not found' });
      return { data: { closed: true } };
    },
  );

  // ── Stats: KPIs + volume trend + tool/model/escalation breakdowns ────
  app.get(
    '/support/stats',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async () => {
      // KPI cards
      const [kpis] = await app.db
        .select({
          today: sql<number>`COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int`,
          last7: sql<number>`COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int`,
          last30: sql<number>`COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int`,
          totalActive: sql<number>`COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int`,
          totalEscalated: sql<number>`COUNT(*) FILTER (WHERE escalated_at IS NOT NULL)::int`,
          totalResolved: sql<number>`COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int`,
          waitingHuman: sql<number>`COUNT(*) FILTER (WHERE status = 'waiting_human')::int`,
          agentReplied: sql<number>`COUNT(*) FILTER (WHERE status = 'agent_replied')::int`,
          openCount: sql<number>`COUNT(*) FILTER (WHERE status = 'open')::int`,
          resolvedCount: sql<number>`COUNT(*) FILTER (WHERE status = 'resolved')::int`,
          closedCount: sql<number>`COUNT(*) FILTER (WHERE status = 'closed')::int`,
          totalConvs: sql<number>`COUNT(*)::int`,
        })
        .from(supportConversations);

      // Median resolution time (closed - created), in seconds
      const [resolution] = await app.db
        .select({
          medianSeconds: sql<number>`COALESCE(
            EXTRACT(EPOCH FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY resolved_at - created_at))::int,
            0
          )`,
        })
        .from(supportConversations)
        .where(sql`resolved_at IS NOT NULL`);

      // Volume: conversations + messages per day for the last 14 days
      const dailyVolume = await app.db.execute(sql`
        SELECT
          d::date AS day,
          COALESCE(c.conv_count, 0)::int AS conversations,
          COALESCE(m.msg_count, 0)::int AS messages
        FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, '1 day'::interval) AS d
        LEFT JOIN (
          SELECT DATE(created_at) AS day, COUNT(*) AS conv_count
          FROM support_conversations
          WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
          GROUP BY DATE(created_at)
        ) c ON c.day = d::date
        LEFT JOIN (
          SELECT DATE(created_at) AS day, COUNT(*) AS msg_count
          FROM support_messages
          WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
          GROUP BY DATE(created_at)
        ) m ON m.day = d::date
        ORDER BY d
      `);

      // Top tools (last 30 days)
      const topTools = await app.db
        .select({
          tool: supportAgentActions.toolName,
          calls: sql<number>`COUNT(*)::int`,
          failures: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')::int`,
          avgDurationMs: sql<number>`COALESCE(AVG((duration_ms)::text::int), 0)::int`,
        })
        .from(supportAgentActions)
        .where(sql`created_at >= NOW() - INTERVAL '30 days'`)
        .groupBy(supportAgentActions.toolName)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(10);

      // Model split (last 30 days, agent messages only)
      const modelSplit = await app.db
        .select({
          model: supportMessages.model,
          messages: sql<number>`COUNT(*)::int`,
        })
        .from(supportMessages)
        .where(sql`role = 'agent' AND created_at >= NOW() - INTERVAL '30 days' AND model IS NOT NULL`)
        .groupBy(supportMessages.model)
        .orderBy(sql`COUNT(*) DESC`);

      // Recent escalations (last 5)
      const recentEscalations = await app.db
        .select({
          id: supportConversations.id,
          subject: supportConversations.subject,
          escalatedAt: supportConversations.escalatedAt,
          agentSummary: supportConversations.agentSummary,
          status: supportConversations.status,
          tenantName: tenants.name,
          userEmail: users.email,
        })
        .from(supportConversations)
        .innerJoin(tenants, eq(tenants.id, supportConversations.tenantId))
        .innerJoin(users, eq(users.id, supportConversations.userId))
        .where(sql`escalated_at IS NOT NULL`)
        .orderBy(desc(supportConversations.escalatedAt))
        .limit(5);

      const escalationRate = kpis.totalConvs > 0
        ? Math.round((kpis.totalEscalated / kpis.totalConvs) * 100)
        : 0;

      return {
        data: {
          kpis: {
            today: kpis.today,
            last7Days: kpis.last7,
            last30Days: kpis.last30,
            totalActive: kpis.totalActive,
            waitingHuman: kpis.waitingHuman,
            totalResolved: kpis.totalResolved,
            escalationRate,
            medianResolutionSeconds: resolution?.medianSeconds ?? 0,
          },
          statusCounts: {
            open: kpis.openCount,
            agent_replied: kpis.agentReplied,
            waiting_human: kpis.waitingHuman,
            resolved: kpis.resolvedCount,
            closed: kpis.closedCount,
          },
          dailyVolume: (dailyVolume.rows as Array<{ day: string; conversations: number; messages: number }>),
          topTools,
          modelSplit,
          recentEscalations,
        },
      };
    },
  );

  // ── Auto-close stale agent_replied conversations ─────────────────────
  // Runs on demand (call from cron / scheduler later). Closes conversations
  // where the agent answered but the user hasn't followed up for N days.
  app.post(
    '/support/sweep',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const days = Number((request.query as { days?: string }).days ?? 3);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const closed = await app.db
        .update(supportConversations)
        .set({ status: 'closed', resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(supportConversations.status, 'agent_replied'),
          sql`${supportConversations.lastMessageAt} < ${cutoff}`,
        ))
        .returning({ id: supportConversations.id });

      return { data: { closed: closed.length, days } };
    },
  );

  // ── Hand back to agent (user can re-engage) ──────────────────────────
  app.post<{ Params: { id: string } }>(
    '/support/conversations/:id/hand-back',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request, reply) => {
      const result = await app.db
        .update(supportConversations)
        .set({ status: 'agent_replied', updatedAt: new Date() })
        .where(eq(supportConversations.id, request.params.id))
        .returning({ id: supportConversations.id });
      if (result.length === 0) return reply.code(404).send({ error: 'Not found' });
      return { data: { handedBack: true } };
    },
  );
};

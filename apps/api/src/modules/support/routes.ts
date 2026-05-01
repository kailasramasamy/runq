/**
 * Support API routes — conversation lifecycle + message exchange with the
 * Claude support agent.
 *
 * Phase 1+2 endpoints:
 *   POST   /conversations            — start a new conversation
 *   GET    /conversations            — list current user's conversations
 *   GET    /conversations/:id        — fetch conversation + messages
 *   POST   /conversations/:id/messages — send a user message, get agent reply
 *   POST   /conversations/:id/resolve  — user marks conversation as resolved
 *
 * Platform-admin endpoints (cross-tenant) live in modules/admin/support.routes.ts.
 */
import { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { supportConversations, supportMessages } from '@runq/db';
import { runSupportTurn, streamSupportTurn } from './agent';
import { publishMessage } from './realtime';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;

type Outcome =
  | 'awaiting_user'
  | 'awaiting_human'
  | 'in_progress'
  | 'answered'
  | 'resolved_by_human'
  | 'resolved_by_user'
  | 'auto_closed'
  | 'closed_by_admin';

/**
 * Resolves each conversation's first user-authored message — used as a
 * preview/title in conversation list views. Single query with a window
 * function so we avoid N+1 lookups.
 */
async function fetchFirstUserMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  conversationIds: string[],
): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (conversation_id) conversation_id, content
    FROM support_messages
    WHERE conversation_id IN (${sql.join(conversationIds.map(id => sql`${id}::uuid`), sql`, `)})
      AND role = 'user'
    ORDER BY conversation_id, created_at ASC
  `);
  const map = new Map<string, string>();
  for (const r of rows.rows as Array<{ conversation_id: string; content: string }>) {
    map.set(r.conversation_id, r.content);
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
    case 'open': return 'in_progress';
    case 'waiting_human': return 'awaiting_human';
    case 'agent_replied': return 'awaiting_user';
    case 'resolved':
      if (hadHumanReply || wasEscalated) return 'resolved_by_human';
      return 'resolved_by_user';
    case 'closed':
      if (hadHumanReply || wasEscalated) return 'closed_by_admin';
      return 'auto_closed';
    default: return 'in_progress';
  }
}

const startConversationSchema = z.object({
  message: z.string().min(1).max(4000),
  subject: z.string().max(200).optional(),
});

const sendMessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

export const supportRoutes: FastifyPluginAsync = async (app) => {
  // ── Start a new conversation ─────────────────────────────────────────
  app.post(
    '/conversations',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { message, subject } = startConversationSchema.parse(request.body);
      const userId = request.user.userId;

      const [conversation] = await app.db
        .insert(supportConversations)
        .values({
          tenantId: request.tenantId,
          userId,
          status: 'open',
          subject,
        })
        .returning();

      const result = await runSupportTurn({
        db: app.db,
        tenantId: request.tenantId,
        userId,
        conversationId: conversation.id,
        userMessage: message,
      });

      return { data: { conversationId: conversation.id, ...result } };
    },
  );

  // ── List user's conversations ────────────────────────────────────────
  app.get(
    '/conversations',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const rows = await app.db
        .select({
          id: supportConversations.id,
          subject: supportConversations.subject,
          status: supportConversations.status,
          lastMessageAt: supportConversations.lastMessageAt,
          createdAt: supportConversations.createdAt,
          escalatedAt: supportConversations.escalatedAt,
          resolvedAt: supportConversations.resolvedAt,
          assignedTo: supportConversations.assignedTo,
        })
        .from(supportConversations)
        .where(and(
          eq(supportConversations.tenantId, request.tenantId),
          eq(supportConversations.userId, request.user.userId),
        ))
        .orderBy(desc(supportConversations.lastMessageAt))
        .limit(50);

      const previewMap = await fetchFirstUserMessages(app.db, rows.map(r => r.id));
      const enriched = rows.map((r) => ({
        ...r,
        outcome: deriveOutcome(r),
        preview: previewMap.get(r.id) ?? null,
      }));
      return { data: enriched };
    },
  );

  // ── Get one conversation with messages ───────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/conversations/:id',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const [conv] = await app.db
        .select()
        .from(supportConversations)
        .where(and(
          eq(supportConversations.id, request.params.id),
          eq(supportConversations.tenantId, request.tenantId),
        ))
        .limit(1);
      if (!conv) return reply.code(404).send({ error: 'Not found' });
      // Tenant-isolation already enforced; also block other users' conversations
      if (conv.userId !== request.user.userId && request.user.role !== 'owner') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const messages = await app.db
        .select({
          id: supportMessages.id,
          role: supportMessages.role,
          content: supportMessages.content,
          createdAt: supportMessages.createdAt,
        })
        .from(supportMessages)
        .where(eq(supportMessages.conversationId, conv.id))
        .orderBy(supportMessages.createdAt);

      return { data: { conversation: conv, messages } };
    },
  );

  // ── Send a message in an existing conversation ───────────────────────
  app.post<{ Params: { id: string } }>(
    '/conversations/:id/messages',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const { message } = sendMessageSchema.parse(request.body);
      const conversationId = request.params.id;

      const [conv] = await app.db
        .select()
        .from(supportConversations)
        .where(and(
          eq(supportConversations.id, conversationId),
          eq(supportConversations.tenantId, request.tenantId),
          eq(supportConversations.userId, request.user.userId),
        ))
        .limit(1);
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      if (conv.status === 'closed') {
        return reply.code(400).send({ error: 'Conversation is closed. Start a new one.' });
      }
      // Re-open a user-resolved conversation if they keep typing
      if (conv.status === 'resolved') {
        await app.db
          .update(supportConversations)
          .set({ status: 'open', resolvedAt: null, updatedAt: new Date() })
          .where(eq(supportConversations.id, conversationId));
      }

      // If a human is handling it, just save the user's reply — don't invoke the agent
      if (conv.status === 'waiting_human') {
        await app.db.insert(supportMessages).values({
          conversationId,
          role: 'user',
          content: message,
        });
        await app.db
          .update(supportConversations)
          .set({ lastMessageAt: new Date(), updatedAt: new Date() })
          .where(eq(supportConversations.id, conversationId));
        publishMessage({
          type: 'message_added',
          conversationId,
          tenantId: request.tenantId,
          userId: request.user.userId,
          role: 'user',
        });
        return { data: { queued: true, message: 'Reply queued for the runQ team.' } };
      }

      const result = await runSupportTurn({
        db: app.db,
        tenantId: request.tenantId,
        userId: request.user.userId,
        conversationId,
        userMessage: message,
      });

      return { data: result };
    },
  );

  // ── User marks conversation resolved ─────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/conversations/:id/resolve',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const result = await app.db
        .update(supportConversations)
        .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(supportConversations.id, request.params.id),
          eq(supportConversations.tenantId, request.tenantId),
          eq(supportConversations.userId, request.user.userId),
        ))
        .returning({ id: supportConversations.id });
      if (result.length === 0) return reply.code(404).send({ error: 'Not found' });
      return { data: { resolved: true } };
    },
  );

  // ── Stream existing conversation turn (SSE) ──────────────────────────
  app.post<{ Params: { id: string } }>(
    '/conversations/:id/stream',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const { message } = sendMessageSchema.parse(request.body);
      const conversationId = request.params.id;

      const [conv] = await app.db
        .select()
        .from(supportConversations)
        .where(and(
          eq(supportConversations.id, conversationId),
          eq(supportConversations.tenantId, request.tenantId),
          eq(supportConversations.userId, request.user.userId),
        ))
        .limit(1);
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      if (conv.status === 'closed') return reply.code(400).send({ error: 'Conversation is closed' });

      if (conv.status === 'waiting_human') {
        await app.db.insert(supportMessages).values({
          conversationId, role: 'user', content: message,
        });
        await app.db
          .update(supportConversations)
          .set({ lastMessageAt: new Date(), updatedAt: new Date() })
          .where(eq(supportConversations.id, conversationId));
        publishMessage({
          type: 'message_added',
          conversationId,
          tenantId: request.tenantId,
          userId: request.user.userId,
          role: 'user',
        });
        return { data: { queued: true } };
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      try {
        for await (const event of streamSupportTurn({
          db: app.db,
          tenantId: request.tenantId,
          userId: request.user.userId,
          conversationId,
          userMessage: message,
        })) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'stream failed';
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
      }
      reply.raw.end();
      return reply;
    },
  );

  // ── Start new conversation with streaming first turn ─────────────────
  app.post(
    '/conversations/stream',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const { message, subject } = startConversationSchema.parse(request.body);
      const userId = request.user.userId;

      const [conversation] = await app.db
        .insert(supportConversations)
        .values({ tenantId: request.tenantId, userId, status: 'open', subject })
        .returning();

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(`data: ${JSON.stringify({ type: 'conversation', id: conversation.id })}\n\n`);

      try {
        for await (const event of streamSupportTurn({
          db: app.db,
          tenantId: request.tenantId,
          userId,
          conversationId: conversation.id,
          userMessage: message,
        })) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'stream failed';
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
      }
      reply.raw.end();
      return reply;
    },
  );
};

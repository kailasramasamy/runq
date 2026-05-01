/**
 * Support WebSocket — pushes message-added / status-changed events to clients
 * subscribed to a specific conversation. Replaces polling for live updates.
 *
 * Auth: JWT via `?token=...` query param (browsers can't set headers on WS).
 *
 * Endpoints:
 *   GET  /api/v1/support/ws?conversationId=...&token=...    — user channel
 *   GET  /api/v1/support/ws/admin?token=...                  — admin firehose
 */
import { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { supportConversations } from '@runq/db';
import { subscribeToConversation, subscribeToAll, type SupportRealtimeEvent } from './realtime';

export const supportWsRoutes: FastifyPluginAsync = async (app) => {
  // ── Per-conversation channel (user side) ─────────────────────────────
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    const conversationId = (req.query as { conversationId?: string }).conversationId;

    if (!token || !conversationId) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing token or conversationId' }));
      socket.close();
      return;
    }

    let payload: { userId: string; tenantId: string };
    try {
      payload = app.jwt.verify(token) as never;
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      socket.close();
      return;
    }

    // Authorization: user must own the conversation (same tenant + user)
    const [conv] = await app.db
      .select({ tenantId: supportConversations.tenantId, userId: supportConversations.userId })
      .from(supportConversations)
      .where(and(
        eq(supportConversations.id, conversationId),
        eq(supportConversations.tenantId, payload.tenantId),
        eq(supportConversations.userId, payload.userId),
      ))
      .limit(1);

    if (!conv) {
      socket.send(JSON.stringify({ type: 'error', message: 'Conversation not found or unauthorized' }));
      socket.close();
      return;
    }

    socket.send(JSON.stringify({ type: 'connected', conversationId }));

    const unsubscribe = subscribeToConversation(conversationId, (event) => {
      try {
        socket.send(JSON.stringify(event));
      } catch {/* socket already closed */}
    });

    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });

  // ── Admin firehose (all events across all tenants) ───────────────────
  app.get('/ws/admin', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    if (!token) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing token' }));
      socket.close();
      return;
    }

    let payload: { platformRole?: string };
    try {
      payload = app.jwt.verify(token) as never;
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      socket.close();
      return;
    }

    if (payload.platformRole !== 'super_admin' && payload.platformRole !== 'support') {
      socket.send(JSON.stringify({ type: 'error', message: 'Forbidden' }));
      socket.close();
      return;
    }

    socket.send(JSON.stringify({ type: 'connected', scope: 'admin' }));

    const unsubscribe = subscribeToAll((event: SupportRealtimeEvent) => {
      try {
        socket.send(JSON.stringify(event));
      } catch {/* socket closed */}
    });

    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
};

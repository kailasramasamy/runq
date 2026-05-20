/**
 * HR helpdesk WebSocket — pushes comment / status events to clients viewing
 * a ticket.
 *
 * Auth: JWT via `?token=...` query param (browsers can't set headers on WS).
 * Authorization:
 *   - Employee can subscribe only to their own ticket
 *   - HR / owner / accountant can subscribe to any ticket in their tenant
 *
 * Endpoints:
 *   GET /api/v1/hr/helpdesk/ws?ticketId=...&token=...
 */
import { FastifyPluginAsync } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { hrTickets, employees, users } from '@runq/db';
import { subscribeToTicket } from './realtime';

const HR_WRITE_ROLES = new Set(['owner', 'accountant', 'hr']);

export const hrHelpdeskWsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/helpdesk/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    const ticketId = (req.query as { ticketId?: string }).ticketId;

    if (!token || !ticketId) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing token or ticketId' }));
      socket.close();
      return;
    }

    let payload: { userId: string; tenantId: string; role: string };
    try {
      payload = app.jwt.verify(token) as never;
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      socket.close();
      return;
    }

    // Ticket must exist in the user's tenant.
    const [ticket] = await app.db
      .select({ id: hrTickets.id, employeeId: hrTickets.employeeId })
      .from(hrTickets)
      .where(and(eq(hrTickets.id, ticketId), eq(hrTickets.tenantId, payload.tenantId)))
      .limit(1);
    if (!ticket) {
      socket.send(JSON.stringify({ type: 'error', message: 'Ticket not found' }));
      socket.close();
      return;
    }

    // Authorization: HR roles see any ticket; viewers see only their own.
    if (!HR_WRITE_ROLES.has(payload.role)) {
      const [match] = await app.db
        .select({ uid: users.id })
        .from(users)
        .innerJoin(employees, sql`lower(${employees.email}) = lower(${users.email})`)
        .where(and(
          eq(users.id, payload.userId),
          eq(employees.id, ticket.employeeId),
        ))
        .limit(1);
      if (!match) {
        socket.send(JSON.stringify({ type: 'error', message: 'Forbidden' }));
        socket.close();
        return;
      }
    }

    socket.send(JSON.stringify({ type: 'connected', ticketId }));

    const unsubscribe = subscribeToTicket(ticketId, (event) => {
      try { socket.send(JSON.stringify(event)); } catch {/* socket closed */}
    });

    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
};

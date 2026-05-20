/**
 * HR helpdesk realtime — single-process pub/sub over an in-memory EventEmitter.
 *
 * Mirrors the support module's pattern. WS subscribers for a ticket receive
 * events when comments are added or the ticket status changes.
 *
 * Swap the EventEmitter for Redis pub/sub when scaling to N API replicas —
 * the publish/subscribe contract stays the same.
 */
import { EventEmitter } from 'node:events';

export type HrHelpdeskRealtimeEvent =
  | {
      type: 'comment_added';
      ticketId: string;
      tenantId: string;
      isAgentDraft: boolean;
      hasAiBadge: boolean;
    }
  | {
      type: 'status_changed';
      ticketId: string;
      tenantId: string;
      status: string;
    }
  | {
      type: 'typing_started';
      ticketId: string;
      tenantId: string;
      actor: 'agent';
    }
  | {
      type: 'typing_stopped';
      ticketId: string;
      tenantId: string;
      actor: 'agent';
    };

const bus = new EventEmitter();
bus.setMaxListeners(1000);

export function publishHelpdeskEvent(event: HrHelpdeskRealtimeEvent): void {
  bus.emit(`ticket:${event.ticketId}`, event);
  bus.emit(`tenant:${event.tenantId}`, event);
}

export function subscribeToTicket(
  ticketId: string,
  handler: (event: HrHelpdeskRealtimeEvent) => void,
): () => void {
  const channel = `ticket:${ticketId}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}

export function subscribeToTenant(
  tenantId: string,
  handler: (event: HrHelpdeskRealtimeEvent) => void,
): () => void {
  const channel = `tenant:${tenantId}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}

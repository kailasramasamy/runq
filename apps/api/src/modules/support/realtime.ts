/**
 * Support realtime — single-process pub/sub over an in-memory EventEmitter.
 *
 * When a support message gets persisted (user, agent, or human), call
 * `publishMessage()`. WebSocket subscribers for that conversation receive
 * the event and refetch on the client side.
 *
 * Single-instance only for now. If we scale to N API replicas, swap the
 * EventEmitter for Redis pub/sub — same publish/subscribe API, no caller
 * changes needed.
 */
import { EventEmitter } from 'node:events';

export type SupportRealtimeEvent =
  | { type: 'message_added'; conversationId: string; tenantId: string; userId: string; role: 'user' | 'agent' | 'human' }
  | { type: 'status_changed'; conversationId: string; tenantId: string; userId: string; status: string };

const bus = new EventEmitter();
bus.setMaxListeners(1000);     // 1 listener per open WS — tune if needed

export function publishMessage(event: SupportRealtimeEvent): void {
  bus.emit(`conv:${event.conversationId}`, event);
  bus.emit('all', event);
}

export function subscribeToConversation(
  conversationId: string,
  handler: (event: SupportRealtimeEvent) => void,
): () => void {
  const channel = `conv:${conversationId}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}

export function subscribeToAll(handler: (event: SupportRealtimeEvent) => void): () => void {
  bus.on('all', handler);
  return () => bus.off('all', handler);
}

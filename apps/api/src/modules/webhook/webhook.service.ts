import { eq, and } from 'drizzle-orm';
import { webhookEvents } from '@runq/db';
import type { Db } from '@runq/db';

type EventType = typeof webhookEvents.$inferInsert['eventType'];

export class WebhookService {
  constructor(private readonly db: Db) {}

  async isDuplicate(eventId: string, tenantId: string): Promise<boolean> {
    const [existing] = await this.db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(and(
        eq(webhookEvents.eventId, eventId),
        eq(webhookEvents.tenantId, tenantId),
        eq(webhookEvents.status, 'processed'),
      ))
      .limit(1);
    return !!existing;
  }

  async logReceived(eventId: string, tenantId: string, eventType: EventType, payload: unknown): Promise<string> {
    const [row] = await this.db.insert(webhookEvents).values({
      eventId,
      tenantId,
      eventType,
      payload,
      status: 'processing',
    }).returning();
    return row!.id;
  }

  async markProcessed(eventId: string, tenantId: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ status: 'processed', processedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(webhookEvents.eventId, eventId), eq(webhookEvents.tenantId, tenantId)));
  }

  async markFailed(eventId: string, tenantId: string, error: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ status: 'failed', errorMessage: error, updatedAt: new Date() })
      .where(and(eq(webhookEvents.eventId, eventId), eq(webhookEvents.tenantId, tenantId)));
  }
}

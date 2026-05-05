import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { notifications } from '@runq/db';
import type { Db } from '@runq/db';

export interface NotificationRow {
  id: string;
  type: 'info' | 'ok' | 'warn';
  source: string;
  title: string;
  body: string | null;
  targetUrl: string | null;
  unread: boolean;
  createdAt: string;
}

export class NotificationsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly userId: string,
  ) {}

  async list(limit = 20): Promise<NotificationRow[]> {
    const rows = await this.db
      .select({
        id: notifications.id,
        type: notifications.type,
        source: notifications.source,
        title: notifications.title,
        body: notifications.body,
        targetUrl: notifications.targetUrl,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(
        eq(notifications.tenantId, this.tenantId),
        eq(notifications.userId, this.userId),
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      source: r.source,
      title: r.title,
      body: r.body,
      targetUrl: r.targetUrl,
      unread: r.readAt == null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async unreadCount(): Promise<number> {
    const rows = await this.db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.tenantId, this.tenantId),
        eq(notifications.userId, this.userId),
        isNull(notifications.readAt),
      ));
    return rows[0]?.c ?? 0;
  }

  async markAllRead(): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.tenantId, this.tenantId),
        eq(notifications.userId, this.userId),
        isNull(notifications.readAt),
      ));
  }

  async markRead(id: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, this.tenantId),
        eq(notifications.userId, this.userId),
      ));
  }

  async create(input: {
    type?: 'info' | 'ok' | 'warn';
    source?: string;
    title: string;
    body?: string;
    targetUrl?: string;
  }): Promise<void> {
    await this.db.insert(notifications).values({
      tenantId: this.tenantId,
      userId: this.userId,
      type: input.type ?? 'info',
      source: input.source ?? 'system',
      title: input.title,
      body: input.body ?? null,
      targetUrl: input.targetUrl ?? null,
    });
  }
}

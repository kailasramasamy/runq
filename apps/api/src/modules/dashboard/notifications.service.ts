import { and, desc, eq, isNull, like, sql } from 'drizzle-orm';
import { notifications } from '@runq/db';
import type { Db } from '@runq/db';
import { sendPushToUser } from '../../utils/push/push.service';

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

  /**
   * Rows belonging to this user, optionally narrowed to one module's namespace.
   * A single user can hold several personas (a dairy operator is usually also an
   * employee), so a single-surface client must be able to scope its inbox — and
   * every read AND write below has to apply the same scope, or the badge counts
   * notices the list never shows and mark-all-read clears another app's inbox.
   */
  private scope(prefix?: string) {
    return and(
      eq(notifications.tenantId, this.tenantId),
      eq(notifications.userId, this.userId),
      prefix ? like(notifications.source, `${prefix}%`) : undefined,
    );
  }

  async list(limit = 20, sourcePrefix?: string): Promise<NotificationRow[]> {
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
      .where(this.scope(sourcePrefix))
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

  async unreadCount(sourcePrefix?: string): Promise<number> {
    const rows = await this.db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(and(this.scope(sourcePrefix), isNull(notifications.readAt)));
    return rows[0]?.c ?? 0;
  }

  async markAllRead(sourcePrefix?: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(this.scope(sourcePrefix), isNull(notifications.readAt)));
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

    // Mirror the in-app notification to the user's mobile devices. Fire-and-
    // forget: a push failure must not fail notification creation.
    void sendPushToUser(this.db, this.tenantId, this.userId, {
      title: input.title,
      body: input.body,
      targetUrl: input.targetUrl,
    }).catch((err) => {
      console.error('[push] sendPushToUser failed:', err);
    });
  }
}

import { and, desc, eq } from 'drizzle-orm';
import { agentEvents } from '@runq/db';
import type { Db } from '@runq/db';

export interface AgentEventRow {
  id: string;
  occurredAt: string;
  kind: string;
  severity: 'ok' | 'warn' | 'info';
  title: string;
  detail: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export class AgentFeedService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(limit: number): Promise<AgentEventRow[]> {
    const rows = await this.db
      .select({
        id: agentEvents.id,
        occurredAt: agentEvents.occurredAt,
        kind: agentEvents.kind,
        severity: agentEvents.severity,
        title: agentEvents.title,
        detail: agentEvents.detail,
        ctaLabel: agentEvents.ctaLabel,
        ctaUrl: agentEvents.ctaUrl,
      })
      .from(agentEvents)
      .where(eq(agentEvents.tenantId, this.tenantId))
      .orderBy(desc(agentEvents.occurredAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      kind: r.kind,
      severity: r.severity,
      title: r.title,
      detail: r.detail,
      ctaLabel: r.ctaLabel,
      ctaUrl: r.ctaUrl,
    }));
  }

  async record(event: {
    kind: string;
    severity?: 'ok' | 'warn' | 'info';
    title: string;
    detail?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(agentEvents).values({
      tenantId: this.tenantId,
      kind: event.kind,
      severity: event.severity ?? 'info',
      title: event.title,
      detail: event.detail ?? null,
      ctaLabel: event.ctaLabel ?? null,
      ctaUrl: event.ctaUrl ?? null,
      relatedEntityType: event.relatedEntityType ?? null,
      relatedEntityId: event.relatedEntityId ?? null,
      metadata: event.metadata ?? null,
    });
  }
}

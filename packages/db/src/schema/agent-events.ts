import { pgTable, uuid, varchar, text, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

export const agentEventSeverityEnum = pgEnum('agent_event_severity', ['ok', 'warn', 'info']);

export const agentEvents = pgTable('agent_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  kind: varchar('kind', { length: 50 }).notNull(),
  severity: agentEventSeverityEnum('severity').notNull().default('info'),
  title: text('title').notNull(),
  detail: text('detail'),
  ctaLabel: varchar('cta_label', { length: 50 }),
  ctaUrl: varchar('cta_url', { length: 500 }),
  relatedEntityType: varchar('related_entity_type', { length: 50 }),
  relatedEntityId: uuid('related_entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_agent_events_tenant_time').on(t.tenantId, t.occurredAt),
  index('idx_agent_events_tenant_kind').on(t.tenantId, t.kind, t.occurredAt),
  index('idx_agent_events_tenant_severity').on(t.tenantId, t.severity, t.occurredAt),
]);

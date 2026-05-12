import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

export const analyticsSnapshots = pgTable('analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  metricKey: varchar('metric_key', { length: 80 }).notNull(),
  period: varchar('period', { length: 20 }).notNull(),
  payload: jsonb('payload').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_analytics_snapshots_tenant_metric_period').on(t.tenantId, t.metricKey, t.period),
  index('idx_analytics_snapshots_metric_recent').on(t.tenantId, t.metricKey, t.computedAt),
]);

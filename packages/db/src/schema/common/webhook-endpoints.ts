import { pgTable, uuid, varchar, boolean, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  url: varchar('url', { length: 500 }).notNull(),
  secret: varchar('secret', { length: 255 }).notNull(),
  events: jsonb('events').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  description: varchar('description', { length: 255 }),
  lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  failureCount: integer('failure_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_we_tenant_active').on(t.tenantId, t.isActive),
]);

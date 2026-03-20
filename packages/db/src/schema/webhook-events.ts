import { pgTable, uuid, varchar, integer, jsonb, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

export const webhookEventStatusEnum = pgEnum('webhook_event_status', ['received', 'processing', 'processed', 'failed']);
export const webhookEventTypeEnum = pgEnum('webhook_event_type', [
  'vendor.created', 'vendor.updated',
  'po.created', 'po.updated',
  'grn.created', 'grn.updated',
  'invoice.created', 'invoice.updated',
]);

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  eventType: webhookEventTypeEnum('event_type').notNull(),
  source: varchar('source', { length: 50 }).notNull().default('wms'),
  payload: jsonb('payload').notNull(),
  status: webhookEventStatusEnum('status').notNull().default('received'),
  errorMessage: text('error_message'),
  retries: integer('retries').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

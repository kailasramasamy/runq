import { pgTable, uuid, varchar, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';
import { users } from './user';

export const notificationTypeEnum = pgEnum('notification_type', ['info', 'ok', 'warn']);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: notificationTypeEnum('type').notNull().default('info'),
  source: varchar('source', { length: 50 }).notNull().default('system'),
  title: text('title').notNull(),
  body: text('body'),
  targetUrl: varchar('target_url', { length: 500 }),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notif_user_recent').on(t.userId, t.createdAt),
  index('idx_notif_tenant').on(t.tenantId, t.createdAt),
]);

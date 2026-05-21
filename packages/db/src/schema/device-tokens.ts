import { pgTable, uuid, varchar, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';
import { users } from './user';

export const devicePlatformEnum = pgEnum('device_platform', ['android', 'ios']);

/**
 * FCM registration tokens for the runQ mobile app — one row per device.
 * The token is globally unique; on re-registration we upsert and re-point
 * tenant/user (a shared device can be re-used by a different employee).
 */
export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  platform: devicePlatformEnum('platform').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_device_tokens_user').on(t.userId),
]);

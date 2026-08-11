import { pgTable, uuid, varchar, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';
import { users } from './user';

export const devicePlatformEnum = pgEnum('device_platform', ['android', 'ios']);

/**
 * Which app registered the token. runQ mobile and Dhenu share this table and
 * — whenever the phone number matches — the same `users.id`, so without this
 * column a push to the user reaches both phones. Notification `source` picks
 * the app at send time: `mp_*` → dhenu, everything else → runq.
 */
export const deviceAppEnum = pgEnum('device_app', ['runq', 'dhenu']);

/**
 * FCM registration tokens — one row per device *per app*. The token is
 * globally unique (FCM issues a distinct one per app install); on
 * re-registration we upsert and re-point tenant/user/app (a shared device can
 * be re-used by a different employee).
 */
export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  platform: devicePlatformEnum('platform').notNull(),
  app: deviceAppEnum('app').notNull().default('runq'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_device_tokens_user').on(t.userId),
  index('idx_device_tokens_user_app').on(t.userId, t.app),
]);

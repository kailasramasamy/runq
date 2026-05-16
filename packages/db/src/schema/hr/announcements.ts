import {
  pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

/** Who sees an announcement. Department-scoped is a future option; today
 *  the dashboard ignores `dept` rows for simplicity. */
export const announcementAudienceEnum = pgEnum('announcement_audience', [
  'all',         // every employee
  'managers',    // managers + admins only
]);

/** Lightweight company-comms surface. The HR manager dashboard pulls the
 *  most recent unexpired rows; admins post from HR > More.
 *
 *  Intentionally minimal — no attachments, no rich text, no comments. A
 *  noticeboard, not a chat. */
export const hrAnnouncements = pgTable('hr_announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  title: varchar('title', { length: 140 }).notNull(),
  body: text('body').notNull(),
  audience: announcementAudienceEnum('audience').notNull().default('all'),
  // Pinned rows always sort to the top, regardless of postedAt.
  pinned: boolean('pinned').notNull().default(false),
  postedById: uuid('posted_by_id').references(() => users.id),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
  // After expiresAt, the row stops appearing in feeds. Nullable = never expires.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Dashboard feed: tenant + non-expired, newest first. Pinned sort is
  // applied in the query layer, not the index.
  index('idx_ann_tenant_posted').on(t.tenantId, t.postedAt),
  index('idx_ann_tenant_expires').on(t.tenantId, t.expiresAt),
]);

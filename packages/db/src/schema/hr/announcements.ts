import {
  pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { departments } from './departments';

/** Role-flavour audience filter. Layered on top of department scoping
 *  (see departmentId below) — `audience` decides who *role-wise* can
 *  see the row, `departmentId` decides who *org-wise* can. */
export const announcementAudienceEnum = pgEnum('announcement_audience', [
  'all',         // every employee
  'managers',    // managers + admins only
]);

/** Category drives the icon + chip the mobile feed renders. CHECK-
 *  constrained in mig 0091; kept loose-typed here so future categories
 *  (e.g. 'wellness') don't require an enum migration. */
export type HrAnnouncementCategory =
  | 'general'
  | 'policy'
  | 'holiday'
  | 'event'
  | 'operational'
  | 'celebration'
  | 'payroll';

/** Company-comms surface. HR + admin post announcements; the mobile
 *  Home feed reads the most-recent unexpired rows visible to the
 *  caller (org-wide + their department + role-appropriate).
 *
 *  Light-rich surface: text + category + optional cover image. No
 *  comments, no reactions, no acknowledgement workflow (yet). */
export const hrAnnouncements = pgTable('hr_announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  title: varchar('title', { length: 140 }).notNull(),
  body: text('body').notNull(),
  audience: announcementAudienceEnum('audience').notNull().default('all'),
  /// Target department. NULL = org-wide (everyone in the tenant).
  /// When set, only employees whose `employees.department_id` matches
  /// see the row. Layered with `audience` — managers-only + a dept
  /// filter both narrow further.
  departmentId: uuid('department_id').references(() => departments.id),
  /// Semantic tag the feed renders as an icon + chip. CHECK-constrained
  /// in mig 0091 to one of the values in HrAnnouncementCategory.
  category: varchar('category', { length: 20 }).notNull().default('general').$type<HrAnnouncementCategory>(),
  /// Optional cover image — S3 storage key, served via
  /// GET /hr/announcements/:id/image. NULL = text-only announcement.
  imageKey: varchar('image_key', { length: 500 }),
  // Pinned rows always sort to the top, regardless of postedAt.
  pinned: boolean('pinned').notNull().default(false),
  postedById: uuid('posted_by_id').references(() => users.id),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
  // After expiresAt, the row stops appearing in feeds. Nullable = never expires.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ann_tenant_posted').on(t.tenantId, t.postedAt),
  index('idx_ann_tenant_expires').on(t.tenantId, t.expiresAt),
  index('idx_ann_tenant_dept').on(t.tenantId, t.departmentId),
]);

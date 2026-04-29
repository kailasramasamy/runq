import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { platformUsers } from './platform';

export const announcementSeverityEnum = pgEnum('announcement_severity', ['info', 'warning', 'critical']);

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  severity: announcementSeverityEnum('severity').notNull().default('info'),
  audience: jsonb('audience').notNull().default({ all: true }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  dismissible: boolean('dismissible').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => platformUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ann_active').on(t.isActive, t.startsAt, t.endsAt),
]);

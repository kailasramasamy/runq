import {
  pgTable, uuid, varchar, timestamp, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { mpQcVerdict } from './enums';

/**
 * Optional richer lab tests beyond FAT/SNF (adulteration, MBRT, acidity).
 * Polymorphic: a test binds to a pour or a consignment via (subject_type,
 * subject_id). Extensible — not required for the base flow.
 */
export const mpQcTests = pgTable('mp_qc_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  subjectType: varchar('subject_type', { length: 20 }).notNull(), // 'pour' | 'consignment'
  subjectId: uuid('subject_id').notNull(),
  testCode: varchar('test_code', { length: 40 }).notNull(),
  value: varchar('value', { length: 60 }),
  uom: varchar('uom', { length: 20 }),
  verdict: mpQcVerdict('verdict'),
  testedAt: timestamp('tested_at', { withTimezone: true }),
  testedBy: uuid('tested_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_qc_subject').on(t.tenantId, t.subjectType, t.subjectId),
]);

export type MpQcTestRow = typeof mpQcTests.$inferSelect;
export type NewMpQcTestRow = typeof mpQcTests.$inferInsert;

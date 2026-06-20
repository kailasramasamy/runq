import {
  pgTable, uuid, date, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { mpNodes } from './nodes';
import { mpShift } from './enums';

/**
 * Per-slot collection close. A row freezes pours/edits for one
 * `(node, collection_date, shift)` and gates dispatch (which requires the slot
 * closed first). A BMC node — which pools the whole day for dispatch — is
 * closed by writing both `am` and `pm` rows, so `shift` stays NOT NULL and the
 * pour guard checks a closure for the pour's own shift without a node lookup.
 *
 * One row per slot: an active closure has `reopened_at IS NULL`. Reopening sets
 * `reopened_at`; re-closing resets it to NULL with a fresh `closed_at`. Reopen
 * is blocked once any consignment exists for the slot (enforced in the service).
 */
export const mpShiftClosures = pgTable('mp_shift_closures', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  nodeId: uuid('node_id').notNull().references(() => mpNodes.id),
  collectionDate: date('collection_date').notNull(),
  shift: mpShift('shift').notNull(),
  closedBy: uuid('closed_by').references(() => users.id),
  closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
  reopenedBy: uuid('reopened_by').references(() => users.id),
  reopenedAt: timestamp('reopened_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_shift_closures_slot')
    .on(t.tenantId, t.nodeId, t.collectionDate, t.shift),
]);

export type MpShiftClosureRow = typeof mpShiftClosures.$inferSelect;
export type NewMpShiftClosureRow = typeof mpShiftClosures.$inferInsert;

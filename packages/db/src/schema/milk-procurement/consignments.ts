import {
  pgTable, uuid, varchar, decimal, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { stockLedger } from '../inventory/stock-ledger';
import { mpNodes } from './nodes';
import { mpConsignmentKind, mpConsignmentStatus, mpShift, mpMilkType } from './enums';

/**
 * Tier-to-tier movement (VMCC→CC, CC→PP). Carries dispatch QC + receipt QC so
 * variance is captured. CC→PP rows are the tankers; on PP receipt a raw-milk
 * batch is posted into the inventory `stock_ledger` and linked here.
 */
export const mpConsignments = pgTable('mp_consignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  consignmentNo: varchar('consignment_no', { length: 40 }).notNull(),
  kind: mpConsignmentKind('kind').notNull(),
  fromNodeId: uuid('from_node_id').notNull().references(() => mpNodes.id),
  toNodeId: uuid('to_node_id').notNull().references(() => mpNodes.id),
  collectionDate: date('collection_date').notNull(),
  shift: mpShift('shift'),
  // Milk type of this movement, derived from the source's actual composition on
  // dispatch (single-type source → that type; mixed → null). Drives which
  // raw-milk item the PP receipt posts to (mp_raw_milk_items).
  milkType: mpMilkType('milk_type'),
  containerNo: varchar('container_no', { length: 40 }),
  dispatchQty: decimal('dispatch_qty', { precision: 12, scale: 3 }),
  dispatchFat: decimal('dispatch_fat', { precision: 5, scale: 2 }),
  dispatchSnf: decimal('dispatch_snf', { precision: 5, scale: 2 }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  dispatchedBy: uuid('dispatched_by').references(() => users.id),
  receiptQty: decimal('receipt_qty', { precision: 12, scale: 3 }),
  receiptFat: decimal('receipt_fat', { precision: 5, scale: 2 }),
  receiptSnf: decimal('receipt_snf', { precision: 5, scale: 2 }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: uuid('received_by').references(() => users.id),
  varianceQty: decimal('variance_qty', { precision: 12, scale: 3 }),
  variancePct: decimal('variance_pct', { precision: 6, scale: 3 }),
  stockLedgerId: uuid('stock_ledger_id').references(() => stockLedger.id),
  status: mpConsignmentStatus('status').notNull().default('in_transit'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_consignment_no').on(t.tenantId, t.consignmentNo),
  index('idx_mp_consignment_to').on(t.tenantId, t.toNodeId, t.collectionDate),
  index('idx_mp_consignment_kind_status').on(t.tenantId, t.kind, t.status),
]);

export type MpConsignmentRow = typeof mpConsignments.$inferSelect;
export type NewMpConsignmentRow = typeof mpConsignments.$inferInsert;

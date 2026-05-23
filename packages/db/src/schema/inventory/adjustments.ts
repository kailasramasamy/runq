import {
  pgTable, uuid, varchar, decimal, text, timestamp, pgEnum, boolean, date, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

export const adjustmentReasonEnum = pgEnum('inv_adjustment_reason', [
  'damage', 'expiry', 'theft', 'found', 'revaluation', 'correction', 'opening_balance',
]);

export const adjustmentStatusEnum = pgEnum('inv_adjustment_status', [
  'draft', 'pending_approval', 'posted', 'cancelled',
]);

export const inventoryAdjustments = pgTable(
  'inventory_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    adjNo: varchar('adj_no', { length: 40 }).notNull(),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    reason: adjustmentReasonEnum('reason').notNull(),
    adjustmentDate: date('adjustment_date').notNull(),
    notes: text('notes'),
    status: adjustmentStatusEnum('status').notNull().default('draft'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    totalValueDelta: decimal('total_value_delta', { precision: 18, scale: 2 }).notNull().default('0'),
    journalEntryId: uuid('journal_entry_id'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (t) => [
    uniqueIndex('uq_inv_adj_tenant_no').on(t.tenantId, t.adjNo),
    index('idx_inv_adj_tenant_status').on(t.tenantId, t.status),
  ],
);

export const inventoryAdjustmentLines = pgTable(
  'inventory_adjustment_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    adjustmentId: uuid('adjustment_id')
      .notNull()
      .references(() => inventoryAdjustments.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => items.id),
    batchNo: varchar('batch_no', { length: 60 }),
    // Signed: positive = inbound (found), negative = outbound (damage / write-off)
    qtyDelta: decimal('qty_delta', { precision: 18, scale: 3 }).notNull(),
    unitCost: decimal('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    valueDelta: decimal('value_delta', { precision: 18, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
  },
  (t) => [
    index('idx_inv_adj_lines_adj').on(t.adjustmentId),
    index('idx_inv_adj_lines_item').on(t.tenantId, t.itemId),
  ],
);

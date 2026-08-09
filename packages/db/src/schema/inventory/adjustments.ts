import {
  pgTable, uuid, varchar, decimal, text, timestamp, pgEnum, boolean, date, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

/**
 * `free_issue` — stock handed over without an invoice (extra cases given to
 * the logistics team to cover their own breakages, trade samples). Kept
 * distinct from `damage` because the goods are intact: the value belongs in
 * distribution cost, not write-off, and under GST §17(5)(h) a free supply
 * requires the input tax on it to be reversed.
 */
export const adjustmentReasonEnum = pgEnum('inv_adjustment_reason', [
  'damage', 'expiry', 'theft', 'found', 'revaluation', 'correction', 'opening_balance',
  'free_issue',
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
    /**
     * Input tax to reverse on this adjustment (free issues, destroyed goods).
     * Captured here so the GSTR-3B Table 4(B) wiring has a source when it
     * lands; no journal line is posted against it today.
     */
    itcReversalValue: decimal('itc_reversal_value', { precision: 18, scale: 2 }).notNull().default('0'),
    /**
     * False suppresses the journal entry on post — for stock the GL never
     * capitalised. MP raw milk is the case this exists for: it carries a
     * pour-derived unit cost on the ledger but no matching Dr Inventory, and
     * the milk is already expensed to 5050 at cycle lock, so writing it off
     * normally would double-expense it. See docs/dhenu-raw-milk-valuation.md §3.
     *
     * Ledger rows and the adjustment document are written either way — only
     * the JE is skipped, so the quantity trail stays complete.
     */
    postGl: boolean('post_gl').notNull().default(true),
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

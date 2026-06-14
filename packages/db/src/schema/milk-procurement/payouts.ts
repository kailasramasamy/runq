import {
  pgTable, uuid, varchar, decimal, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { payments } from '../ap/payments';
import { journalEntries } from '../gl/journal-entries';
import { mpFarmers } from './farmers';
import { mpNodes } from './nodes';
import { mpCycleStatus, mpDeduction, mpLedgerEntry } from './enums';

/** Payout cycle (every ~10 days). Rolls up totals + posts GL on lock. */
export const mpPayoutCycles = pgTable('mp_payout_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  cycleNo: varchar('cycle_no', { length: 40 }).notNull(),
  // null = whole tenant; else scoped to a VMCC/society
  scopeNodeId: uuid('scope_node_id').references(() => mpNodes.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: mpCycleStatus('status').notNull().default('open'),
  totalQty: decimal('total_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  totalGross: decimal('total_gross', { precision: 15, scale: 2 }).notNull().default('0'),
  totalDeductions: decimal('total_deductions', { precision: 15, scale: 2 }).notNull().default('0'),
  totalNet: decimal('total_net', { precision: 15, scale: 2 }).notNull().default('0'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_cycle_no').on(t.tenantId, t.cycleNo),
  index('idx_mp_cycle_status').on(t.tenantId, t.status),
]);

/**
 * Per-farmer line in a cycle. In `via_vmcc` mode many lines share the one
 * `payment_id` made to the VMCC vendor; `settled_via_node_id` records the VMCC.
 */
export const mpPayoutLines = pgTable('mp_payout_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  payoutCycleId: uuid('payout_cycle_id').notNull().references(() => mpPayoutCycles.id),
  farmerId: uuid('farmer_id').notNull().references(() => mpFarmers.id),
  qtyLitres: decimal('qty_litres', { precision: 12, scale: 3 }).notNull().default('0'),
  grossAmount: decimal('gross_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  bonusAmount: decimal('bonus_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  deductionTotal: decimal('deduction_total', { precision: 15, scale: 2 }).notNull().default('0'),
  netAmount: decimal('net_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  paymentId: uuid('payment_id').references(() => payments.id),
  settledViaNodeId: uuid('settled_via_node_id').references(() => mpNodes.id),
  statementNo: varchar('statement_no', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_payout_lines_cycle').on(t.tenantId, t.payoutCycleId),
  index('idx_mp_payout_lines_farmer').on(t.tenantId, t.farmerId),
]);

/**
 * Farmer advances & cattle-feed loans — append-only running balance. Payout
 * pulls outstanding into deductions. (Part-2 feed orders post `feed_loan_given`.)
 */
export const mpFarmerLedger = pgTable('mp_farmer_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  farmerId: uuid('farmer_id').notNull().references(() => mpFarmers.id),
  entryType: mpLedgerEntry('entry_type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 15, scale: 2 }).notNull(),
  refType: varchar('ref_type', { length: 40 }),
  refId: uuid('ref_id'),
  occurredOn: date('occurred_on').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_ledger_farmer').on(t.tenantId, t.farmerId, t.occurredOn),
]);

/** Deduction lines on a payout line, each pointing at the source ledger debit. */
export const mpPayoutDeductions = pgTable('mp_payout_deductions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  payoutLineId: uuid('payout_line_id').notNull().references(() => mpPayoutLines.id),
  deductionType: mpDeduction('deduction_type').notNull(),
  ledgerEntryId: uuid('ledger_entry_id').references(() => mpFarmerLedger.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  note: varchar('note', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_mp_deductions_line').on(t.tenantId, t.payoutLineId),
]);

export type MpPayoutCycleRow = typeof mpPayoutCycles.$inferSelect;
export type NewMpPayoutCycleRow = typeof mpPayoutCycles.$inferInsert;
export type MpPayoutLineRow = typeof mpPayoutLines.$inferSelect;
export type NewMpPayoutLineRow = typeof mpPayoutLines.$inferInsert;

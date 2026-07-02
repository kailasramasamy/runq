import {
  pgTable, uuid, varchar, decimal, integer, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from '../ap/vendors';
import { payments } from '../ap/payments';
import { journalEntries } from '../gl/journal-entries';
import { mpNodes } from './nodes';
import { mpPayoutCycles } from './payouts';
import { mpBillStatus } from './enums';

/**
 * Per-VMCC settlement bill for a locked payout cycle. When a VMCC pays its
 * farmers on the company's behalf (`payoutMode = via_vmcc`), the company owes it
 * the milk cost it fronted (net payable to those farmers) plus the VMCC
 * operator's full comp (commission + salary + rent). The bill is the settlement
 * unit: paying it settles the farmer payable, books the commission expense,
 * creates the AP payment to the VMCC vendor, and captures the transaction
 * confirmation. One bill per (cycle, VMCC).
 */
export const mpVmccBills = pgTable('mp_vmcc_bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  billNo: varchar('bill_no', { length: 40 }).notNull(),
  payoutCycleId: uuid('payout_cycle_id').notNull().references(() => mpPayoutCycles.id),
  vmccNodeId: uuid('vmcc_node_id').notNull().references(() => mpNodes.id),
  // Denormalized parent CC so the billing page can filter by CC without a join.
  ccNodeId: uuid('cc_node_id').notNull().references(() => mpNodes.id),
  // Snapshot of the VMCC's payee vendor at generate time (receives the payment).
  payeeVendorId: uuid('payee_vendor_id').references(() => vendors.id),
  // Amount breakdown, snapshotted at generation.
  milkCost: decimal('milk_cost', { precision: 15, scale: 2 }).notNull().default('0'),
  commission: decimal('commission', { precision: 15, scale: 2 }).notNull().default('0'),
  salary: decimal('salary', { precision: 15, scale: 2 }).notNull().default('0'),
  rent: decimal('rent', { precision: 15, scale: 2 }).notNull().default('0'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  qtyLitres: decimal('qty_litres', { precision: 12, scale: 3 }).notNull().default('0'),
  farmerCount: integer('farmer_count').notNull().default(0),
  status: mpBillStatus('status').notNull().default('generated'),
  // Settlement: AP payment for the milk-cost leg + two JEs (payable settle,
  // commission expense) kept separate for clean reversal.
  paymentId: uuid('payment_id').references(() => payments.id),
  milkJournalEntryId: uuid('milk_journal_entry_id').references(() => journalEntries.id),
  commissionJournalEntryId: uuid('commission_journal_entry_id').references(() => journalEntries.id),
  txnReference: varchar('txn_reference', { length: 120 }),
  paymentMode: varchar('payment_mode', { length: 30 }),
  paymentDate: date('payment_date'),
  paidBy: uuid('paid_by').references(() => users.id),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_mp_vmcc_bill_no').on(t.tenantId, t.billNo),
  uniqueIndex('uq_mp_vmcc_bill_cycle_node').on(t.tenantId, t.payoutCycleId, t.vmccNodeId),
  index('idx_mp_vmcc_bill_cc').on(t.tenantId, t.ccNodeId, t.payoutCycleId),
  index('idx_mp_vmcc_bill_status').on(t.tenantId, t.status),
]);

export type MpVmccBillRow = typeof mpVmccBills.$inferSelect;
export type NewMpVmccBillRow = typeof mpVmccBills.$inferInsert;

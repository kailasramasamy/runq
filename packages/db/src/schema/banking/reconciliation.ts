import { pgTable, uuid, date, decimal, boolean, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankAccounts } from './bank-accounts';
import { bankTransactions } from './bank-transactions';
import { payments } from '../ap/payments';
import { paymentReceipts } from '../ar/receipts';
import { journalEntries } from '../gl/journal-entries';
import { employeePayments } from '../hr/employee-payments';
import { statutoryChallans } from '../hr/statutory-challans';
import { users } from '../user';

export const reconMatchTypeEnum = pgEnum('recon_match_type', ['auto_utr', 'auto_amount_date', 'manual', 'expense_post']);

export const bankReconciliations = pgTable('bank_reconciliations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  bankClosingBalance: decimal('bank_closing_balance', { precision: 15, scale: 2 }).notNull(),
  bookClosingBalance: decimal('book_closing_balance', { precision: 15, scale: 2 }).notNull(),
  difference: decimal('difference', { precision: 15, scale: 2 }).notNull(),
  isCompleted: boolean('is_completed').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reconciliationMatches = pgTable('reconciliation_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  bankTransactionId: uuid('bank_transaction_id').notNull().references(() => bankTransactions.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  receiptId: uuid('receipt_id').references(() => paymentReceipts.id),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  employeePaymentId: uuid('employee_payment_id').references(() => employeePayments.id),
  statutoryChallanId: uuid('statutory_challan_id').references(() => statutoryChallans.id),
  matchType: reconMatchTypeEnum('match_type').notNull(),
  matchedBy: uuid('matched_by').references(() => users.id),
  matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_rm_bank_transaction_id').on(t.bankTransactionId),
  index('idx_rm_payment_id').on(t.paymentId),
  index('idx_rm_receipt_id').on(t.receiptId),
  index('idx_rm_journal_entry_id').on(t.journalEntryId),
  index('idx_rm_employee_payment_id').on(t.employeePaymentId),
  index('idx_rm_statutory_challan_id').on(t.statutoryChallanId),
]);

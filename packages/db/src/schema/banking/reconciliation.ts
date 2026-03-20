import { pgTable, uuid, date, decimal, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankAccounts } from './bank-accounts';
import { bankTransactions } from './bank-transactions';
import { payments } from '../ap/payments';
import { paymentReceipts } from '../ar/receipts';
import { users } from '../user';

export const reconMatchTypeEnum = pgEnum('recon_match_type', ['auto_utr', 'auto_amount_date', 'manual']);

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
  matchType: reconMatchTypeEnum('match_type').notNull(),
  matchedBy: uuid('matched_by').references(() => users.id),
  matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

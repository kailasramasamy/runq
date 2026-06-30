import { pgTable, uuid, varchar, date, decimal, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { bankAccounts } from './bank-accounts';
import { bankTransactions } from './bank-transactions';
import { accounts } from '../gl/accounts';

export const pendingPaymentStatusEnum = pgEnum('pending_payment_status', ['pending', 'matched', 'cancelled']);

/**
 * A payment the owner made out-of-band (e.g. a bank QR/UPI scan) and captured
 * in the app at the moment of paying — amount, expense category, payee, note,
 * and a photo of the confirmation. It carries no GL posting on its own; when
 * the bank statement is later imported, the matching debit is reconciled
 * against this row (Dr expense / Cr bank) so the context isn't forgotten.
 */
export const pendingPayments = pgTable('pending_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  paymentDate: date('payment_date').notNull(),
  glAccountId: uuid('gl_account_id').notNull().references(() => accounts.id),
  payeeName: varchar('payee_name', { length: 255 }),
  note: varchar('note', { length: 500 }),
  // UPI reference / UTR off the confirmation — enables an exact bank match.
  upiRef: varchar('upi_ref', { length: 64 }),
  status: pendingPaymentStatusEnum('status').notNull().default('pending'),
  matchedBankTransactionId: uuid('matched_bank_transaction_id').references(() => bankTransactions.id),
  matchedAt: timestamp('matched_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pending_pay_tenant_status').on(t.tenantId, t.status),
  index('idx_pending_pay_account_amount').on(t.bankAccountId, t.amount),
]);

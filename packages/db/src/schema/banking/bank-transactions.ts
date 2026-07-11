import { pgTable, uuid, varchar, date, decimal, timestamp, pgEnum, index, integer } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankAccounts } from './bank-accounts';
import { accounts } from '../gl/accounts';
import { journalEntries } from '../gl/journal-entries';

export const bankTxnTypeEnum = pgEnum('bank_txn_type', ['credit', 'debit']);
export const reconStatusEnum = pgEnum('recon_status', ['unreconciled', 'matched', 'manually_matched', 'excluded']);

export const bankTransactions = pgTable('bank_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  transactionDate: date('transaction_date').notNull(),
  valueDate: date('value_date'),
  type: bankTxnTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 100 }),
  narration: varchar('narration', { length: 500 }),
  // User-entered memo ("paid to X for Y") for party-less categorized txns;
  // when set it becomes the journal entry description. The narration above is
  // the bank's import string and is never overwritten.
  memo: varchar('memo', { length: 500 }),
  runningBalance: decimal('running_balance', { precision: 15, scale: 2 }),
  // Row position within the source statement (0-based, in file order). Bank
  // statements list oldest-first and carry no per-txn time, so this is the
  // only signal that orders same-day transactions chronologically. Sorted
  // desc alongside transaction_date so the latest same-day txn sits on top.
  statementSeq: integer('statement_seq'),
  reconStatus: reconStatusEnum('recon_status').notNull().default('unreconciled'),
  importBatchId: uuid('import_batch_id'),
  // Vendor/Customer & GL posting
  vendorId: uuid('vendor_id'),
  customerId: uuid('customer_id'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  // AI categorization
  glAccountId: uuid('gl_account_id').references(() => accounts.id),
  glConfidence: decimal('gl_confidence', { precision: 3, scale: 2 }),
  glSuggestedAt: timestamp('gl_suggested_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bt_tenant_account_date').on(t.tenantId, t.bankAccountId, t.transactionDate),
  index('idx_bt_tenant_recon_status').on(t.tenantId, t.reconStatus),
  // Backs the per-account report's category grouping.
  index('idx_bt_tenant_account_gl').on(t.tenantId, t.bankAccountId, t.glAccountId),
]);

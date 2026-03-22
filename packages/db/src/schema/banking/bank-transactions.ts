import { pgTable, uuid, varchar, date, decimal, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankAccounts } from './bank-accounts';

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
  runningBalance: decimal('running_balance', { precision: 15, scale: 2 }),
  reconStatus: reconStatusEnum('recon_status').notNull().default('unreconciled'),
  importBatchId: uuid('import_batch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_bt_tenant_account_date').on(t.tenantId, t.bankAccountId, t.transactionDate),
  index('idx_bt_tenant_recon_status').on(t.tenantId, t.reconStatus),
]);

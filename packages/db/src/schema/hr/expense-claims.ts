import { pgTable, uuid, varchar, text, decimal, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

export const expenseClaimStatusEnum = pgEnum('expense_claim_status', [
  'draft', 'submitted', 'approved', 'rejected', 'reimbursed',
]);

export const expenseClaims = pgTable('expense_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  claimNumber: varchar('claim_number', { length: 50 }).notNull(),
  claimantId: uuid('claimant_id').notNull().references(() => users.id),
  claimDate: varchar('claim_date', { length: 10 }).notNull(),
  description: text('description'),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  status: expenseClaimStatusEnum('status').notNull().default('draft'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  reimbursedAt: timestamp('reimbursed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ec_tenant_status').on(t.tenantId, t.status),
  index('idx_ec_tenant_claimant').on(t.tenantId, t.claimantId),
]);

export const expenseClaimItems = pgTable('expense_claim_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  claimId: uuid('claim_id').notNull().references(() => expenseClaims.id),
  expenseDate: varchar('expense_date', { length: 10 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  accountCode: varchar('account_code', { length: 20 }),
  receiptUrl: varchar('receipt_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_eci_tenant_claim').on(t.tenantId, t.claimId),
]);

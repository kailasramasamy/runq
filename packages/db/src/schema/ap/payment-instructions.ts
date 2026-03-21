import { pgTable, uuid, varchar, text, decimal, integer, timestamp, date, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { vendors } from './vendors';
import { payments } from './payments';

export const paymentBatchStatusEnum = pgEnum('payment_batch_status', [
  'pending_approval',
  'partially_approved',
  'approved',
  'rejected',
  'executed',
]);

export const instructionStatusEnum = pgEnum('instruction_status', [
  'pending',
  'approved',
  'rejected',
  'paid',
  'failed',
]);

export const paymentBatches = pgTable(
  'payment_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    batchId: varchar('batch_id', { length: 100 }).notNull(),
    source: varchar('source', { length: 100 }).notNull(),
    description: text('description'),
    status: paymentBatchStatusEnum('status').notNull().default('pending_approval'),
    totalCount: integer('total_count').notNull(),
    totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
    approvedCount: integer('approved_count').notNull().default(0),
    approvedAmount: decimal('approved_amount', { precision: 15, scale: 2 }).notNull().default('0'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantBatchUniq: uniqueIndex('payment_batches_tenant_batch_id_uniq').on(t.tenantId, t.batchId),
    tenantStatusIdx: index('payment_batches_tenant_status_idx').on(t.tenantId, t.status),
  }),
);

export const paymentInstructions = pgTable(
  'payment_instructions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    batchId: uuid('batch_id').notNull().references(() => paymentBatches.id),
    vendorId: uuid('vendor_id').references(() => vendors.id),
    vendorName: varchar('vendor_name', { length: 255 }).notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    reference: varchar('reference', { length: 100 }),
    reason: text('reason'),
    dueDate: date('due_date'),
    status: instructionStatusEnum('status').notNull().default('pending'),
    paymentId: uuid('payment_id').references(() => payments.id),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantBatchIdx: index('payment_instructions_tenant_batch_idx').on(t.tenantId, t.batchId),
    tenantStatusIdx: index('payment_instructions_tenant_status_idx').on(t.tenantId, t.status),
  }),
);

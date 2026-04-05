import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from './vendors';

export const vendorContractStatusEnum = pgEnum('vendor_contract_status', ['draft', 'active', 'expired', 'cancelled']);

export const vendorContracts = pgTable('vendor_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  contractNumber: varchar('contract_number', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  value: decimal('value', { precision: 15, scale: 2 }),
  terms: text('terms'),
  status: vendorContractStatusEnum('status').notNull().default('draft'),
  renewalDate: date('renewal_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index().on(t.tenantId, t.vendorId),
  index().on(t.tenantId, t.status),
]);

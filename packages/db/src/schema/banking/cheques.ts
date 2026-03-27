import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { bankAccounts } from './bank-accounts';

export const chequeTypeEnum = pgEnum('cheque_type', ['received', 'issued']);
export const chequePartyTypeEnum = pgEnum('cheque_party_type', ['vendor', 'customer']);
export const chequeStatusEnum = pgEnum('cheque_status', ['pending', 'deposited', 'cleared', 'bounced', 'cancelled']);

export const cheques = pgTable('cheques', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  chequeNumber: varchar('cheque_number', { length: 20 }).notNull(),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  type: chequeTypeEnum('type').notNull(),
  partyType: chequePartyTypeEnum('party_type').notNull(),
  partyId: uuid('party_id').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  chequeDate: date('cheque_date').notNull(),
  depositDate: date('deposit_date'),
  status: chequeStatusEnum('status').notNull().default('pending'),
  linkedInvoiceId: uuid('linked_invoice_id'),
  bouncedAt: timestamp('bounced_at', { withTimezone: true }),
  bounceReason: text('bounce_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_cheques_tenant_status').on(t.tenantId, t.status),
  index('idx_cheques_tenant_date').on(t.tenantId, t.chequeDate),
]);

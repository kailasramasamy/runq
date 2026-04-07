import { pgTable, uuid, varchar, integer, jsonb, text, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { customers } from './customers';

export const quickInvoiceTemplates = pgTable(
  'quick_invoice_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    name: varchar('name', { length: 255 }).notNull(),
    paymentTermsDays: integer('payment_terms_days').notNull().default(30),
    notes: text('notes'),
    items: jsonb('items').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_qit_tenant_customer').on(t.tenantId, t.customerId),
    index('idx_qit_tenant_active').on(t.tenantId, t.isActive),
  ],
);

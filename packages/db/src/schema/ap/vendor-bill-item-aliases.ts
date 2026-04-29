import { pgTable, uuid, varchar, text, integer, numeric, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from './vendors';

export const vendorBillItemAliases = pgTable('vendor_bill_item_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  rawDescription: text('raw_description').notNull(),
  normalizedKey: text('normalized_key').notNull(),
  suggestedHsnSac: varchar('suggested_hsn_sac', { length: 10 }),
  suggestedTaxRate: numeric('suggested_tax_rate', { precision: 5, scale: 2 }),
  suggestedTaxCategory: varchar('suggested_tax_category', { length: 20 }),
  useCount: integer('use_count').notNull().default(1),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('vendor_bill_item_aliases_tenant_vendor_key_uniq').on(t.tenantId, t.vendorId, t.normalizedKey),
  index('idx_vbia_lookup').on(t.tenantId, t.vendorId, t.normalizedKey),
]);

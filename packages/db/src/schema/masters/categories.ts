import { pgTable, uuid, varchar, timestamp, index, uniqueIndex, boolean, decimal, integer } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 100 }).notNull(),
    // Self-FK enforced at DB level via fk_categories_parent (migration 0111).
    parentId: uuid('parent_id'),
    // Defaults that cascade into items at create time when the item leaves
    // these blank. Set on category nodes (typically the parent) so a CA
    // doing a bulk item import gets HSN/GST autofilled per category.
    defaultHsnSac: varchar('default_hsn_sac', { length: 8 }),
    defaultGstRate: decimal('default_gst_rate', { precision: 5, scale: 2 }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_categories_tenant').on(table.tenantId),
    index('idx_categories_parent').on(table.parentId),
    uniqueIndex('uq_categories_tenant_name_parent').on(table.tenantId, table.name, table.parentId),
  ],
);

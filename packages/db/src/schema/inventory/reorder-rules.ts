import {
  pgTable, uuid, decimal, integer, timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { warehouses } from './warehouses';

/**
 * Per-(item, warehouse) override of the item-level reorder fields.
 * Falls back to items.reorder_level / items.reorder_qty if no row.
 *
 * Phase 2: only the alert evaluation uses this. Phase 3 wires PR/PO
 * auto-creation.
 */
export const reorderRules = pgTable(
  'inventory_reorder_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    itemId: uuid('item_id').notNull().references(() => items.id),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    reorderLevel: decimal('reorder_level', { precision: 18, scale: 3 }).notNull(),
    reorderQty: decimal('reorder_qty', { precision: 18, scale: 3 }).notNull(),
    leadTimeDays: integer('lead_time_days'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_reorder_rule_per_item_wh').on(t.tenantId, t.itemId, t.warehouseId),
    index('idx_reorder_rule_tenant').on(t.tenantId),
  ],
);

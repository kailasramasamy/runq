import {
  pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const warehouseTypeEnum = pgEnum('warehouse_type', [
  'main', 'godown', 'shop', 'vehicle', 'virtual',
]);

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    type: warehouseTypeEnum('type').notNull().default('godown'),
    address: text('address'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_wh_tenant_code').on(t.tenantId, t.code),
    index('idx_wh_tenant_active').on(t.tenantId, t.isActive),
  ],
);

import {
  pgTable,
  uuid,
  varchar,
  date,
  decimal,
  integer,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from '../tenant';
import { users } from '../user';
import { items } from '../masters/items';

/**
 * Manufacturing BOM (Bill of Materials) — recipe header.
 *
 * Versioning: editing a BOM that has WOs referencing it creates a new version
 * row and flips `is_active`. WOs snapshot `(bom_id, bom_version)` so historical
 * costing reproduces.
 *
 * One active BOM per (tenant, output_item) is enforced by the partial unique
 * index `uq_bom_active_per_item`.
 */
export const boms = pgTable(
  'boms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    bomCode: varchar('bom_code', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),

    outputItemId: uuid('output_item_id')
      .notNull()
      .references(() => items.id),
    outputQty: decimal('output_qty', { precision: 12, scale: 3 }).notNull(),
    outputUom: varchar('output_uom', { length: 20 }).notNull(),

    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    effectiveFrom: date('effective_from'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_bom_tenant_code_version').on(
      t.tenantId,
      t.bomCode,
      t.version,
    ),
    index('idx_bom_tenant_output').on(t.tenantId, t.outputItemId),
    index('idx_bom_tenant_code').on(t.tenantId, t.bomCode),
    uniqueIndex('uq_bom_active_per_item')
      .on(t.tenantId, t.outputItemId)
      .where(sql`${t.isActive} = true`),
  ],
);

export type BomRow = typeof boms.$inferSelect;
export type NewBomRow = typeof boms.$inferInsert;

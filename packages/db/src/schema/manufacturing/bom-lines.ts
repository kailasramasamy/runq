import {
  pgTable,
  uuid,
  varchar,
  decimal,
  integer,
  text,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from '../masters/items';
import { boms } from './boms';

/**
 * Manufacturing BOM input lines.
 *
 * Expected input for a WO of qty `wo_qty`:
 *   expected = qty_per_output × wo_qty × (1 + scrap_pct / 100)
 *
 * `scrap_pct` drives expected-qty math only — no scrap stock movements in v1.
 */
export const bomLines = pgTable(
  'bom_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),

    inputItemId: uuid('input_item_id')
      .notNull()
      .references(() => items.id),
    qtyPerOutput: decimal('qty_per_output', {
      precision: 12,
      scale: 4,
    }).notNull(),
    inputUom: varchar('input_uom', { length: 20 }).notNull(),
    scrapPct: decimal('scrap_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),

    isOptional: boolean('is_optional').notNull().default(false),
    notes: text('notes'),
  },
  (t) => [
    index('idx_bom_lines_bom').on(t.bomId),
    index('idx_bom_lines_input').on(t.inputItemId),
  ],
);

export type BomLineRow = typeof bomLines.$inferSelect;
export type NewBomLineRow = typeof bomLines.$inferInsert;

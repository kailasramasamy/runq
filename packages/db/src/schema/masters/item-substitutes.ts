import { pgTable, uuid, integer, index, unique } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { items } from './items';

/**
 * Items the warehouse may hand over in place of this one.
 *
 * A 500ml Farm Fresh pouch runs out at 4am and the van still has to leave, so
 * an A2 pouch goes in its place. That is a decision the business already made
 * — declared once here, it becomes a one-tap action on the dispatch screen
 * instead of a manual stock adjustment nobody can reconstruct later.
 *
 * One-directional on purpose: A2 standing in for Farm Fresh is a courtesy the
 * customer accepts at the billed price; the reverse would quietly give away
 * the premium. Declare the direction you actually want offered.
 */
export const itemSubstitutes = pgTable(
  'item_substitutes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    substituteItemId: uuid('substitute_item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    /** Order the picker offers them in — lowest first. */
    priority: integer('priority').notNull().default(0),
  },
  (t) => [
    index('idx_item_subs_item').on(t.tenantId, t.itemId),
    unique('uq_item_subs_item_sub').on(t.itemId, t.substituteItemId),
  ],
);

export type ItemSubstituteRow = typeof itemSubstitutes.$inferSelect;
export type NewItemSubstituteRow = typeof itemSubstitutes.$inferInsert;

import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * The `categories` table or — far more often — one of the aliases a caller
 * joins it under.
 *
 * Typed by the three columns this ordering reads rather than as
 * `typeof categories`: every alias carries its own table-name literal
 * ("cat_leaf", "bom_cat_leaf", "pl_cat_leaf", …), so the concrete table type
 * rejects each one of them.
 */
type CategoryAlias = {
  sortOrder: AnyPgColumn;
  name: AnyPgColumn;
  parentId: AnyPgColumn;
};

/**
 * Category-tree display order: the root category's sort_order, then the
 * subcategory's, with uncategorised rows last.
 *
 * `items.category_id` points at EITHER a root category OR a subcategory, so any
 * ordering has to resolve a row to its (root, leaf) pair first. That's what the
 * two aliases are: callers already left-join them to derive their `category` /
 * `subcategory` display strings, so this adds no join of its own. A root-level
 * leaf IS the category and has no subcategory, so it sorts ahead of its own
 * children — hence NULLS FIRST on the two leaf keys.
 *
 * The name after each sort_order is not decorative. sort_order defaults to 0,
 * so a tenant who has never touched the reorder UI has every category sitting
 * on the same key; without the name tiebreak the order would be whatever the
 * planner chose that day, and would drift between pages of the same list.
 *
 * Callers append their own final tiebreak — usually `items.name`.
 */
export function categoryTreeOrder(leaf: CategoryAlias, parent: CategoryAlias) {
  return [
    sql`COALESCE(${parent.sortOrder}, ${leaf.sortOrder}) ASC NULLS LAST`,
    sql`COALESCE(${parent.name}, ${leaf.name}) ASC NULLS LAST`,
    sql`CASE WHEN ${leaf.parentId} IS NULL THEN NULL ELSE ${leaf.sortOrder} END ASC NULLS FIRST`,
    sql`CASE WHEN ${leaf.parentId} IS NULL THEN NULL ELSE ${leaf.name} END ASC NULLS FIRST`,
  ];
}

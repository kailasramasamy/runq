/**
 * Manufacturing — BOM domain types.
 * Spec: docs/manufacturing-plan.md §4.1–4.2.
 */

export interface Bom {
  id: string;
  tenantId: string;
  bomCode: string;
  name: string;
  outputItemId: string;
  outputQty: number;
  outputUom: string;
  version: number;
  isActive: boolean;
  /** Output is labelled at dispatch, so a short DN line makes it on demand. */
  allowAutoRepack: boolean;
  effectiveFrom: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One acceptable stand-in for a BOM line's item. */
export interface BomLineSubstitute {
  itemId: string;
  /** Joined from items master at read time. Always populated by the API. */
  itemName: string;
  /** Tiebreak between equally-fresh stock; the draw is FEFO first. */
  priority: number;
}

export interface BomLine {
  id: string;
  tenantId: string;
  bomId: string;
  lineNo: number;
  inputItemId: string;
  /** Joined from items master at read time. Always populated by the API. */
  inputItemName: string;
  qtyPerOutput: number;
  inputUom: string;
  scrapPct: number;
  /**
   * Items this line will accept instead of its own — "7 L of milk, A2 or A1 or
   * buffalo". The qty stays on the line; substitutes carry none of their own.
   */
  substitutes: BomLineSubstitute[];
  isOptional: boolean;
  notes: string | null;
}

export interface BomWithLines extends Bom {
  lines: BomLine[];
  outputItemName: string;
  /** Count of WOs that snapshot this BOM. Used by edit flows to warn that editing
   * will auto-create a new version row. Always populated by the API. */
  linkedWoCount: number;
}

export interface BomListRow extends Bom {
  outputItemName: string;
  /** The output item's place in the category tree, for grouping the list.
   *  A product filed on a root category has a category but no subcategory. */
  outputCategoryId: string | null;
  outputCategory: string | null;
  outputSubcategory: string | null;
  lineCount: number;
}

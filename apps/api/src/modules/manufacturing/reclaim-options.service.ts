/**
 * Reclaim options — what the morning teardown screen offers the technician.
 *
 * The floor counts packets, not litres. Everything else is derivable, so it is
 * derived here rather than asked for:
 *
 *   packet -> raw material   the FG's own active BOM, read backwards. A
 *                            "Farm Fresh Cow Milk 500ml" BOM consuming 0.51 L
 *                            of A1 Milk (Raw) means one packet holds 0.51 L.
 *   raw material -> what next  every other active BOM consuming that same raw
 *                            material. Curd today, paneer the day a paneer BOM
 *                            exists — no product names hardcoded here.
 *
 * Only finished goods actually sitting in the warehouse are returned: you
 * cannot cut open packets you do not have.
 */

import { and, eq, gt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@runq/db';
import { boms, bomLines, items, stockOnHand, categories } from '@runq/db';

const outputItem = alias(items, 'reclaim_output_item');
const inputItem = alias(items, 'reclaim_input_item');
// Axis-2 category tree — leaf plus its parent, so the screen can section the
// list the way the floor thinks about the shelf (Milk & Dairy > Milk).
const category = alias(categories, 'reclaim_category');
const parentCategory = alias(categories, 'reclaim_category_parent');

export interface ReclaimDestination {
  itemId: string;
  itemName: string;
  bomCode: string;
}

export interface ReclaimableProduct {
  fgItemId: string;
  fgItemName: string;
  fgUnit: string | null;
  fgTracksBatches: boolean;
  onHandQty: number;
  recoveredItemId: string;
  recoveredItemName: string;
  recoveredUnit: string | null;
  recoveredTracksBatches: boolean;
  /** Raw material released per packet opened, from the FG's own BOM. */
  yieldPerUnit: number;
  /** What tearing down the whole shelf would release — onHandQty x yield. */
  projectedRecoveryQty: number;
  categoryName: string | null;
  categoryGroup: string | null;
  destinations: ReclaimDestination[];
}

export class ReclaimOptionsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(warehouseId: string): Promise<ReclaimableProduct[]> {
    const rows = await this.reclaimableRows(warehouseId);
    if (rows.length === 0) return [];

    const destinations = await this.destinationsByRawItem(
      [...new Set(rows.map((r) => r.recoveredItemId))],
    );

    return rows.map((r) => ({
      fgItemId: r.fgItemId,
      fgItemName: r.fgItemName,
      fgUnit: r.fgUnit,
      fgTracksBatches: r.fgTracksBatches ?? false,
      onHandQty: Number(r.onHandQty),
      recoveredItemId: r.recoveredItemId,
      recoveredItemName: r.recoveredItemName,
      recoveredUnit: r.recoveredUnit,
      recoveredTracksBatches: r.recoveredTracksBatches ?? false,
      yieldPerUnit: Number(r.yieldPerUnit),
      projectedRecoveryQty:
        Math.round(Number(r.onHandQty) * Number(r.yieldPerUnit) * 1000) / 1000,
      categoryName: r.categoryName,
      categoryGroup: r.categoryGroup,
      // A product is never its own destination — re-packing milk as the same
      // milk is not what the teardown is for.
      destinations: (destinations.get(r.recoveredItemId) ?? []).filter(
        (d) => d.itemId !== r.fgItemId,
      ),
    }));
  }

  /**
   * Finished goods in stock whose BOM consumes exactly one raw material.
   * Multi-raw-material recipes are skipped: splitting a torn-down pack back
   * across two inputs is a judgement call, not something to guess at 6am.
   */
  private async reclaimableRows(warehouseId: string) {
    return this.db
      .select({
        fgItemId: outputItem.id,
        fgItemName: outputItem.name,
        fgUnit: outputItem.unit,
        fgTracksBatches: outputItem.trackBatches,
        onHandQty: sql<string>`SUM(${stockOnHand.qty})`,
        recoveredItemId: inputItem.id,
        recoveredItemName: inputItem.name,
        recoveredUnit: inputItem.unit,
        recoveredTracksBatches: inputItem.trackBatches,
        yieldPerUnit: sql<string>`MAX(${bomLines.qtyPerOutput} / NULLIF(${boms.outputQty}, 0))`,
        categoryName: category.name,
        categoryGroup: parentCategory.name,
      })
      .from(boms)
      .innerJoin(outputItem, eq(outputItem.id, boms.outputItemId))
      .innerJoin(bomLines, eq(bomLines.bomId, boms.id))
      .innerJoin(inputItem, eq(inputItem.id, bomLines.inputItemId))
      .leftJoin(category, eq(category.id, outputItem.categoryId))
      .leftJoin(parentCategory, eq(parentCategory.id, category.parentId))
      .innerJoin(
        stockOnHand,
        and(
          eq(stockOnHand.itemId, boms.outputItemId),
          eq(stockOnHand.warehouseId, warehouseId),
          eq(stockOnHand.tenantId, this.tenantId),
        ),
      )
      .where(
        and(
          eq(boms.tenantId, this.tenantId),
          eq(boms.isActive, true),
          eq(inputItem.itemClass, 'raw_material'),
          gt(stockOnHand.qty, '0'),
        ),
      )
      .groupBy(
        outputItem.id, outputItem.name, outputItem.unit, outputItem.trackBatches,
        inputItem.id, inputItem.name, inputItem.unit, inputItem.trackBatches,
        category.name, parentCategory.name,
      )
      .orderBy(outputItem.name);
  }

  /** Every active BOM that consumes each raw material — the "what next" list. */
  private async destinationsByRawItem(
    rawItemIds: string[],
  ): Promise<Map<string, ReclaimDestination[]>> {
    const out = new Map<string, ReclaimDestination[]>();
    if (rawItemIds.length === 0) return out;

    const rows = await this.db
      .select({
        rawItemId: bomLines.inputItemId,
        itemId: boms.outputItemId,
        itemName: outputItem.name,
        bomCode: boms.bomCode,
      })
      .from(bomLines)
      .innerJoin(boms, eq(boms.id, bomLines.bomId))
      .innerJoin(outputItem, eq(outputItem.id, boms.outputItemId))
      .where(
        and(
          eq(boms.tenantId, this.tenantId),
          eq(boms.isActive, true),
          sql`${bomLines.inputItemId} IN (${sql.join(rawItemIds.map((id) => sql`${id}`), sql`, `)})`,
        ),
      )
      .orderBy(outputItem.name);

    for (const r of rows) {
      const list = out.get(r.rawItemId) ?? [];
      list.push({ itemId: r.itemId, itemName: r.itemName, bomCode: r.bomCode });
      out.set(r.rawItemId, list);
    }
    return out;
  }
}

/**
 * Inventory GL poster — single funnel for stock-movement journal entries.
 *
 * Every stock-affecting action (GRN post, DN dispatch, adjustment, stock-take
 * variance) routes through here. Direct writes to `journalEntries` from
 * individual inventory services are forbidden — that's how Finance ↔
 * inventory ties stay auditable.
 *
 * Account codes are the seeded ones from standard-chart-of-accounts.ts:
 *   1112  Inventory — Finished Goods   (asset)
 *   2115  GR/IR Clearing                (liability — system)
 *   5100  Cost of Goods Sold            (expense)
 *   5104  Inventory Write-off           (expense — system)
 *   4207  Inventory Gain                (revenue — system)
 *
 * Tenants who customised their CoA can override these via tenant settings
 * (future). For phase 1 the codes are hardcoded.
 */

import { GLService } from '../gl/gl.service';

export const INV_ACCOUNTS = {
  INVENTORY_ASSET: '1112',
  GR_IR_CLEARING: '2115',
  COGS: '5100',
  WRITE_OFF: '5104',
  GAIN: '4207',
} as const;

export class InventoryGlPoster {
  private readonly gl: GLService;

  // Accepts either the top-level Db client or a drizzle transaction; both
  // expose the same surface GLService needs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, private readonly tenantId: string, private readonly userId?: string) {
    this.gl = new GLService(db, tenantId);
  }

  /** GRN post: Inventory Asset Dr / GR/IR Clearing Cr. */
  async postGrn(args: {
    date: string;
    grnId: string;
    grnNo: string;
    value: number;
  }): Promise<string> {
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Goods receipt ${args.grnNo}`,
      sourceType: 'inventory_grn',
      sourceId: args.grnId,
      lines: [
        { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: args.value, credit: 0, description: 'Stock received' },
        { accountCode: INV_ACCOUNTS.GR_IR_CLEARING, debit: 0, credit: args.value, description: 'Awaiting vendor bill' },
      ],
      createdBy: this.userId,
    });
    return je.id;
  }

  /** Reversal of a posted GRN — flips the original entry. */
  async reverseGrn(args: {
    date: string;
    grnId: string;
    grnNo: string;
    value: number;
    reason: string;
  }): Promise<string> {
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Reversal — GRN ${args.grnNo} (${args.reason})`,
      sourceType: 'inventory_grn_reversal',
      sourceId: args.grnId,
      lines: [
        { accountCode: INV_ACCOUNTS.GR_IR_CLEARING, debit: args.value, credit: 0 },
        { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: 0, credit: args.value },
      ],
      createdBy: this.userId,
    });
    return je.id;
  }

  /** Delivery dispatch: COGS Dr / Inventory Asset Cr. */
  async postDelivery(args: {
    date: string;
    dnId: string;
    dnNo: string;
    cogsValue: number;
  }): Promise<string> {
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Delivery ${args.dnNo}`,
      sourceType: 'delivery_note',
      sourceId: args.dnId,
      lines: [
        { accountCode: INV_ACCOUNTS.COGS, debit: args.cogsValue, credit: 0, description: 'Stock dispatched' },
        { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: 0, credit: args.cogsValue },
      ],
      createdBy: this.userId,
    });
    return je.id;
  }

  /**
   * Adjustment posting. `valueDelta` is signed against Inventory Asset:
   *   positive → Inventory Asset Dr / Inventory Gain Cr (found, revaluation up)
   *   negative → Inventory Write-off Dr / Inventory Asset Cr (damage, expiry,
   *     theft, correction down, revaluation down)
   *
   * Caller computes the signed delta per the adjustment lines.
   */
  async postAdjustment(args: {
    date: string;
    adjustmentId: string;
    adjNo: string;
    reason: string;
    valueDelta: number;
  }): Promise<string | null> {
    if (args.valueDelta === 0) return null;
    const abs = Math.abs(args.valueDelta);
    const isInbound = args.valueDelta > 0;
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Adjustment ${args.adjNo} (${args.reason})`,
      sourceType: 'inventory_adjustment',
      sourceId: args.adjustmentId,
      lines: isInbound
        ? [
            { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: abs, credit: 0 },
            { accountCode: INV_ACCOUNTS.GAIN, debit: 0, credit: abs },
          ]
        : [
            { accountCode: INV_ACCOUNTS.WRITE_OFF, debit: abs, credit: 0 },
            { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: 0, credit: abs },
          ],
      createdBy: this.userId,
    });
    return je.id;
  }

  /**
   * Stock-take posting — same accounts as adjustment, but the description
   * carries the stock-take number so the trail-by-source view groups them.
   */
  async postStockTake(args: {
    date: string;
    stockTakeId: string;
    stNo: string;
    valueDelta: number;
  }): Promise<string | null> {
    if (args.valueDelta === 0) return null;
    const abs = Math.abs(args.valueDelta);
    const isInbound = args.valueDelta > 0;
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Stock take variance ${args.stNo}`,
      sourceType: 'inventory_stock_take',
      sourceId: args.stockTakeId,
      lines: isInbound
        ? [
            { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: abs, credit: 0 },
            { accountCode: INV_ACCOUNTS.GAIN, debit: 0, credit: abs },
          ]
        : [
            { accountCode: INV_ACCOUNTS.WRITE_OFF, debit: abs, credit: 0 },
            { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: 0, credit: abs },
          ],
      createdBy: this.userId,
    });
    return je.id;
  }

  /** Reversal of a dispatched DN. */
  async reverseDelivery(args: {
    date: string;
    dnId: string;
    dnNo: string;
    cogsValue: number;
    reason: string;
  }): Promise<string> {
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Reversal — Delivery ${args.dnNo} (${args.reason})`,
      sourceType: 'delivery_note_reversal',
      sourceId: args.dnId,
      lines: [
        { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: args.cogsValue, credit: 0 },
        { accountCode: INV_ACCOUNTS.COGS, debit: 0, credit: args.cogsValue },
      ],
      createdBy: this.userId,
    });
    return je.id;
  }
}

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
 *   5106  Free Issues & Trade Allowance (expense — system)
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
  FREE_ISSUE: '5106',
  GAIN: '4207',
} as const;

/**
 * Which account an outbound adjustment lands in.
 *
 * `free_issue` is stock given away intact — that's a distribution cost, not a
 * loss. `correction` / `revaluation` aren't losses either: they undo a count
 * the books never should have carried, so they debit Inventory Gain and net
 * off against the inbound leg of the same mistake. Everything else genuinely
 * leaves the business short and keeps 5104 meaning "goods we lost" — the same
 * set /reports/write-offs counts, so ledger and report never disagree.
 */
function outboundAccountFor(reason: string): string {
  if (reason === 'free_issue') return INV_ACCOUNTS.FREE_ISSUE;
  if (reason === 'correction' || reason === 'revaluation') return INV_ACCOUNTS.GAIN;
  return INV_ACCOUNTS.WRITE_OFF;
}

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

  /**
   * GRN post for a PO receive that mixes stock-tracked catalog lines and
   * pure-expense catalog lines (e.g. consumables, packaging not in stock).
   * Single JE keeps the GRN ↔ JE 1:1 link intact; bill-match later clears
   * GRNI in one shot regardless of the Dr split.
   *
   *   Dr Inventory  (sum of catalog rows with inventory_item_id wired)
   *   Dr Expense    (sum of catalog rows that are catalog-only)
   *   Cr GRNI       (total)
   *
   * When either side is zero the corresponding Dr line is omitted.
   */
  async postPoReceive(args: {
    date: string;
    grnId: string;
    grnNo: string;
    inventoryValue: number;
    expenseValue: number;
    expenseAccountCode: string;
  }): Promise<string> {
    const total = args.inventoryValue + args.expenseValue;
    const lines: Array<{ accountCode: string; debit: number; credit: number; description?: string }> = [];
    if (args.inventoryValue > 0) {
      lines.push({
        accountCode: INV_ACCOUNTS.INVENTORY_ASSET,
        debit: args.inventoryValue,
        credit: 0,
        description: 'Stock received',
      });
    }
    if (args.expenseValue > 0) {
      lines.push({
        accountCode: args.expenseAccountCode,
        debit: args.expenseValue,
        credit: 0,
        description: 'Consumables received',
      });
    }
    lines.push({
      accountCode: INV_ACCOUNTS.GR_IR_CLEARING,
      debit: 0,
      credit: total,
      description: 'Awaiting vendor bill',
    });
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Goods receipt ${args.grnNo}`,
      sourceType: 'inventory_grn',
      sourceId: args.grnId,
      lines,
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
   *   negative → expense Dr / Inventory Asset Cr, where the expense account is
   *     picked from the reason: `free_issue` → 5106, everything else → 5104.
   *
   * Caller computes the signed delta per the adjustment lines.
   *
   * The ITC to reverse on free issues / destroyed goods is recorded on the
   * adjustment row, not here — the reversal is claimed through GSTR-3B Table
   * 4(B) against the input-tax pool, and posting a journal line for it before
   * that return is filed would double-count it.
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
            { accountCode: outboundAccountFor(args.reason), debit: abs, credit: 0 },
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

  /**
   * Sales return: Inventory Asset Dr / COGS Cr, at the original dispatch
   * cost. Same shape as reverseDelivery but a distinct sourceType — a return
   * is a real event to report on, not the unwinding of a mistake.
   */
  async postSalesReturn(args: {
    date: string;
    dnId: string;
    dnNo: string;
    cogsValue: number;
  }): Promise<string> {
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Sales return ${args.dnNo}`,
      sourceType: 'sales_return',
      sourceId: args.dnId,
      lines: [
        { accountCode: INV_ACCOUNTS.INVENTORY_ASSET, debit: args.cogsValue, credit: 0, description: 'Stock returned' },
        { accountCode: INV_ACCOUNTS.COGS, debit: 0, credit: args.cogsValue },
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

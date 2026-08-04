/**
 * Manufacturing GL poster — single funnel for Work Order journal entries.
 *
 * v1 posts a same-account JE on close: input cost shifts from "consumed" to
 * "FG produced" within account 1112. This matches the existing inventory
 * accounting (see `apps/api/src/modules/inventory/gl-poster.ts` — every GRN
 * also posts to 1112 regardless of itemClass). When the inventory poster
 * moves to class-routed accounts (RM=1111, Packing=1113, FG=1112), this
 * poster gets updated in the same sub-project — `consumedValueByClass` is
 * carried through the signature so the change is mechanical.
 *
 * Yield variance is NOT posted (actual costing — cost is conserved). The
 * variance value sits on `work_orders.yield_variance` for reporting only.
 * 5105 stays seeded for the future standard-costing path (Phase C).
 *
 * Plan: docs/manufacturing-plan.md §3.3 + §8.4.
 */

import { GLService } from '../gl/gl.service';
import { INV_ACCOUNTS } from '../inventory/gl-poster';

export interface PostManufactureCloseArgs {
  /** WO close date (passes lock-date check inside `createJournalEntry`). */
  date: string;
  woId: string;
  woNumber: string;
  bomName: string;
  /** sum(wo_output.value), reconciled to consumedValue at close. */
  outputValue: number;
  /** sum(wo_consumption.value). */
  consumedValue: number;
  /** Per-class breakdown — surfaced for the future class-routed poster. */
  consumedValueByClass: Record<string, number>;
}

export class ManufacturingGlPoster {
  private readonly gl: GLService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    db: any,
    private readonly tenantId: string,
    private readonly userId?: string,
  ) {
    this.gl = new GLService(db, tenantId);
  }

  /**
   * WO close — under v1 actual costing with the single-account inventory
   * convention, the JE would be a `Dr 1112 / Cr 1112` same-account shuffle
   * with zero net impact on the trial balance, P&L, or balance sheet.
   *
   * Decision (2026-05-30, Vrindavan dogfood): **skip the JE when net impact
   * is zero.** The stock movements are already in `stock_ledger` with the
   * correct WAC; nothing more needs to land in GL. `work_orders.je_id` stays
   * NULL for cost-conserved closes, and the `stock_ledger.journal_entry_id`
   * backlink stays NULL for production rows in v1. Activity register on the
   * inventory account stays clean.
   *
   * The JE machinery still posts when output_value ≠ consumed_value — that
   * case can't arise under v1 actual costing (cost conservation guarantee),
   * but it WILL arise when standard costing or class-routed inventory
   * accounts land (Phase C). When that happens, this poster does the right
   * thing without further change: variance lines go to 5105 + cross-class
   * Dr/Cr flows through `1111` / `1113` / `1112`.
   */
  async postClose(args: PostManufactureCloseArgs): Promise<string | null> {
    // Zero-value WO (e.g. all inputs were zero-cost) — nothing to record.
    if (args.outputValue === 0 && args.consumedValue === 0) return null;

    // v1 actual costing: input cost rolls into output cost on the same
    // inventory account → no JE needed. The stock_ledger captures the move.
    if (args.outputValue === args.consumedValue) return null;

    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Production — ${args.woNumber} — ${args.bomName}`,
      sourceType: 'work_order',
      sourceId: args.woId,
      lines: [
        {
          accountCode: INV_ACCOUNTS.INVENTORY_ASSET,
          debit: args.outputValue,
          credit: 0,
          description: 'FG produced',
        },
        {
          accountCode: INV_ACCOUNTS.INVENTORY_ASSET,
          debit: 0,
          credit: args.consumedValue,
          description: 'Inputs consumed',
        },
      ],
      createdBy: this.userId,
    });
    return je.id;
  }

  /**
   * Reclaim post — finished goods torn down back into raw material.
   *
   * Recovered material enters at raw-material WAC, which is below the FG cost
   * it came out of (the packaging and processing spent on it are not coming
   * back). Both stock legs sit on 1112, so they net out and the journal entry
   * carries only the shortfall — same zero-net-impact convention as `postClose`.
   *
   *   Dr 5104 Inventory Write-off   loss
   *     Cr 1112 Inventory Asset     loss
   *
   * The loss can never be negative: the service caps recovered value at the FG
   * value consumed, so a teardown never manufactures a gain out of a cheap FG
   * batch meeting an expensive raw-material pool. Zero loss (fully recovered)
   * posts nothing.
   */
  async postReclaim(args: {
    date: string;
    reclaimId: string;
    reclaimNo: string;
    lossValue: number;
  }): Promise<string | null> {
    if (args.lossValue <= 0) return null;
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Reclaim ${args.reclaimNo} — teardown loss`,
      sourceType: 'mfg_reclaim',
      sourceId: args.reclaimId,
      lines: [
        {
          accountCode: INV_ACCOUNTS.WRITE_OFF,
          debit: args.lossValue,
          credit: 0,
          description: 'Packaging + process cost not recovered',
        },
        {
          accountCode: INV_ACCOUNTS.INVENTORY_ASSET,
          debit: 0,
          credit: args.lossValue,
        },
      ],
      createdBy: this.userId,
    });
    return je.id;
  }

  /**
   * Reversal of a closed WO — flips the original posting. Used when a
   * close needs to be undone after the fact (Phase 2.5+; not exposed in
   * v1 — workaround is a manual correction JE). Kept here so the surface
   * is in one place when needed.
   */
  async reverseClose(args: PostManufactureCloseArgs & { reason: string }): Promise<string | null> {
    if (args.outputValue === 0 && args.consumedValue === 0) return null;
    const je = await this.gl.createJournalEntry({
      date: args.date,
      description: `Reversal — Production ${args.woNumber} (${args.reason})`,
      sourceType: 'work_order_reversal',
      sourceId: args.woId,
      lines: [
        {
          accountCode: INV_ACCOUNTS.INVENTORY_ASSET,
          debit: args.consumedValue,
          credit: 0,
          description: 'Inputs restored',
        },
        {
          accountCode: INV_ACCOUNTS.INVENTORY_ASSET,
          debit: 0,
          credit: args.outputValue,
          description: 'FG reversed',
        },
      ],
      createdBy: this.userId,
    });
    return je.id;
  }
}

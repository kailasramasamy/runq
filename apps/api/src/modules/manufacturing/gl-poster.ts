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
   * WO close — same-account stock shuffle in v1. Returns je.id for storage
   * on `work_orders.je_id`.
   *
   * Cost conservation: outputValue === consumedValue (caller guarantees via
   * `costing.assignOutputCosts` rounding-drift handling). If they differ
   * `GLService.createJournalEntry` will throw on the balance check.
   */
  async postClose(args: PostManufactureCloseArgs): Promise<string | null> {
    // Zero-value WO (e.g. all inputs were zero-cost) — skip JE entirely.
    // The stock movements still posted; there's nothing financial to record.
    if (args.outputValue === 0 && args.consumedValue === 0) return null;

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

/**
 * Shipping the goods at the moment the invoice is issued.
 *
 * For a business that sends what it bills the same day — a dairy loading a van
 * against the morning's orders — working a dispatch queue afterwards is a
 * second pass over a decision already made, and one that gets skipped. Skipped
 * long enough and the stock ledger stops describing the warehouse at all.
 *
 * With `settings.autoDispatchOnInvoice` on, issuing an invoice raises and posts
 * its delivery note in one action. Nothing new moves stock: this assembles the
 * same lines the pending-dispatch screen would have shown and hands them to the
 * same two calls, so FEFO, the repack of made-on-demand SKUs, costing and the
 * GL all behave exactly as they do when a human confirms the queue.
 *
 * The one rule that shapes everything here: **issuing an invoice must not fail
 * because of stock.** A customer's bill does not depend on the warehouse
 * agreeing, so every failure below is caught and reported, never thrown. A
 * dispatch that can't post leaves its draft DN in the queue for a human.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { deliveryNotes, tenants, warehouses } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { SalesDispatchService } from './sales-dispatch.service';
import { DeliveryNoteService } from './delivery.service';

interface Ctx { db: Db; tenantId: string; userId?: string }

/** What auto-dispatch did, for the caller to report back to the user. */
export type AutoDispatchOutcome =
  | { status: 'off' }
  | { status: 'skipped'; reason: string }
  | { status: 'dispatched'; dnId: string; dnNo: string; lineCount: number }
  | { status: 'failed'; reason: string; dnId?: string; dnNo?: string };

export class AutoDispatchService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * Dispatch everything an invoice still owes, if the tenant asked for that.
   *
   * Never throws. The caller has already issued the invoice; a stock problem
   * here is news to report, not a reason to unwind a billing document.
   */
  async runForInvoice(invoiceId: string): Promise<AutoDispatchOutcome> {
    try {
      if (!(await this.isEnabled())) return { status: 'off' };

      const existingDn = await this.existingDnFor(invoiceId);
      if (existingDn) {
        // A DN already covers this invoice — raised by hand, or by an earlier
        // run. Shipping again would double the movement.
        return { status: 'skipped', reason: `Already has delivery note ${existingDn}` };
      }

      const warehouseId = await this.defaultWarehouseId();
      if (!warehouseId) {
        return {
          status: 'skipped',
          reason: 'No default warehouse — set one in Inventory → Warehouses to dispatch automatically',
        };
      }

      return await this.dispatchInvoice(invoiceId, warehouseId);
    } catch (err) {
      return { status: 'failed', reason: messageOf(err) };
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async dispatchInvoice(
    invoiceId: string,
    warehouseId: string,
  ): Promise<AutoDispatchOutcome> {
    const dispatch = new SalesDispatchService(this.ctx);
    const { lines } = await dispatch.previewInvoice(invoiceId, warehouseId);

    // Same filter the confirm screen applies: lines that resolve to a stocked
    // item and still owe goods. An unmapped description or a service line is
    // not a failure — there is simply nothing to ship for it.
    const shippable = lines.filter(
      (l) => (l.resolution === 'item' || l.resolution === 'alias')
        && l.remainingQty > 0
        && l.itemId,
    );
    if (shippable.length === 0) {
      return { status: 'skipped', reason: 'No stocked lines to dispatch' };
    }

    const dn = await dispatch.createFromInvoice(invoiceId, {
      warehouseId,
      dispatchDate: new Date().toISOString().slice(0, 10),
      vehicleNo: null,
      lrNo: null,
      notes: 'Auto-dispatched on invoice issue',
      lines: shippable.map((l) => ({
        itemId: l.itemId!,
        invoiceLineId: l.invoiceLineId,
        qty: l.remainingQty,
        batchNo: l.suggestedBatchNo ?? null,
        uom: l.uom ?? null,
      })),
    });

    try {
      await new DeliveryNoteService(this.ctx).dispatch(dn.id);
    } catch (err) {
      // Draft survives on purpose — it holds the picked lines, so the queue
      // shows a half-done job to finish rather than nothing at all.
      return { status: 'failed', reason: messageOf(err), dnId: dn.id, dnNo: dn.dnNo };
    }

    return {
      status: 'dispatched',
      dnId: dn.id,
      dnNo: dn.dnNo,
      lineCount: shippable.length,
    };
  }

  private async isEnabled(): Promise<boolean> {
    const [row] = await this.ctx.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.ctx.tenantId))
      .limit(1);
    const settings = (row?.settings ?? {}) as Partial<TenantSettings>;
    return settings.autoDispatchOnInvoice === true;
  }

  private async existingDnFor(invoiceId: string): Promise<string | null> {
    const [row] = await this.ctx.db
      .select({ dnNo: deliveryNotes.dnNo })
      .from(deliveryNotes)
      .where(and(
        eq(deliveryNotes.tenantId, this.ctx.tenantId),
        eq(deliveryNotes.invoiceId, invoiceId),
        sql`${deliveryNotes.status} <> 'cancelled'`,
      ))
      .limit(1);
    return row?.dnNo ?? null;
  }

  /**
   * The warehouse flagged default, or the only active one. Anything else is
   * ambiguous, and guessing which godown stock left is not a guess worth
   * making silently.
   */
  private async defaultWarehouseId(): Promise<string | null> {
    const rows = await this.ctx.db
      .select({ id: warehouses.id, isDefault: warehouses.isDefault })
      .from(warehouses)
      .where(and(
        eq(warehouses.tenantId, this.ctx.tenantId),
        eq(warehouses.isActive, true),
      ));
    const flagged = rows.find((w) => w.isDefault);
    if (flagged) return flagged.id;
    return rows.length === 1 ? rows[0]!.id : null;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

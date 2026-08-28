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
 * agreeing, so every failure below is caught and reported, never thrown. Nor
 * does one short line hold back the rest: what the warehouse can cover posts,
 * and only the uncovered remainder is left as a draft DN for a human.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { deliveryNotes, tenants, warehouses } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { SalesDispatchService } from './sales-dispatch.service';
import type { PreviewLine } from './sales-dispatch.service';
import type { SplitLine } from './auto-dispatch.logic';
import { shortfallReason, splitByAvailability } from './auto-dispatch.logic';
import { DeliveryNoteService } from './delivery.service';
import { StockAlertNotifier } from './stock-alert-notifier';
import type { PendingShortfall } from './stock-alert-notifier';

interface Ctx { db: Db; tenantId: string; userId?: string }

/** Lines the warehouse couldn't cover, parked on a draft for a human. */
export interface DispatchShortfall {
  dnId: string;
  dnNo: string;
  lineCount: number;
  reason: string;
  /**
   * What is owed, so the caller can name it without re-reading the draft.
   * The uom rides along because the same product name covers several SKUs —
   * "Farm Fresh Cow Milk" is both the 500ml pouch and the 1L — and a shortage
   * that doesn't say which one is not actionable.
   */
  items: Array<{ itemName: string; qty: number; uom: string | null }>;
}

/** What auto-dispatch did, for the caller to report back to the user. */
export type AutoDispatchOutcome =
  | { status: 'off' }
  | { status: 'skipped'; reason: string }
  | {
    status: 'dispatched';
    dnId: string;
    dnNo: string;
    lineCount: number;
    shortfall?: DispatchShortfall;
  }
  /**
   * The warehouse could cover none of it. Distinct from `failed` on purpose:
   * nothing went wrong, the shelf was simply empty, and the caller's next move
   * is to offer a substitute rather than to report an error. Folding this into
   * `failed` made a routine 4am shortage look like a bug and left clients with
   * no item detail to put in front of the operator.
   */
  | { status: 'shortfall'; dnId: string; dnNo: string; shortfall: DispatchShortfall }
  | { status: 'failed'; reason: string; dnId?: string; dnNo?: string };

/** How a hand-driven run should date and address its delivery notes. */
export interface BulkDispatchOptions {
  /** `invoice` backdates each DN to the day it was billed; `today` posts now. */
  dateMode: 'invoice' | 'today';
  /** Override the tenant default — needed when several godowns are active. */
  warehouseId?: string | null;
  notes?: string | null;
}

export interface BulkDispatchResult {
  invoiceId: string;
  outcome: AutoDispatchOutcome;
}

export class AutoDispatchService {
  /**
   * Shortfalls seen since the last notify. A bulk run clearing a backlog can
   * turn up dozens; twenty pushes in a row is how people learn to swipe the
   * app away, so they are collected and sent as one.
   */
  private pendingShortfalls: PendingShortfall[] = [];

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

      const outcome = await this.dispatchInvoice(invoiceId, warehouseId, { dateMode: 'today' });
      // Deliberately no notification. This runs as an invoice is issued, so
      // the person who caused the shortage is looking at the screen and is
      // about to be asked about it directly — a push telling them what they
      // just did is noise. The bulk lane still notifies: nobody is watching a
      // backlog being cleared.
      this.pendingShortfalls = [];
      return outcome;
    } catch (err) {
      return { status: 'failed', reason: messageOf(err) };
    }
  }

  /**
   * The same shipment, asked for by hand — clearing a backlog off the
   * pending-dispatch queue rather than riding an invoice being issued.
   *
   * Not gated on `autoDispatchOnInvoice`: that setting says "ship without
   * being asked", and this caller is asking. Everything downstream is
   * identical, including never throwing.
   */
  async dispatchOne(
    invoiceId: string,
    opts: BulkDispatchOptions,
  ): Promise<AutoDispatchOutcome> {
    try {
      const existingDn = await this.existingDnFor(invoiceId);
      if (existingDn) {
        return { status: 'skipped', reason: `Already has delivery note ${existingDn}` };
      }

      const warehouseId = opts.warehouseId ?? await this.defaultWarehouseId();
      if (!warehouseId) {
        return {
          status: 'skipped',
          reason: 'No default warehouse — set one in Inventory → Warehouses, or pick one for this run',
        };
      }

      return await this.dispatchInvoice(invoiceId, warehouseId, opts);
    } catch (err) {
      return { status: 'failed', reason: messageOf(err) };
    }
  }

  /**
   * A batch of invoices, one after another.
   *
   * Strictly sequential, and not an accident: two dispatches in flight race
   * for the same batches, the second finding a bin the first already claimed.
   * The caller chunks — this loop is bounded by what fits in one request.
   */
  async runForInvoices(
    invoiceIds: string[],
    opts: BulkDispatchOptions,
  ): Promise<BulkDispatchResult[]> {
    const out: BulkDispatchResult[] = [];
    for (const invoiceId of invoiceIds) {
      out.push({ invoiceId, outcome: await this.dispatchOne(invoiceId, opts) });
    }
    await this.notifyShortfalls();
    return out;
  }

  /**
   * Best-effort by design: the goods have already moved and the drafts are
   * already parked. A notification service having a bad day is not a reason
   * to report a dispatch as failed.
   */
  private queueShortfalls(short: SplitLine<PreviewLine>[], customerName: string | null): void {
    for (const s of short) {
      this.pendingShortfalls.push({
        itemName: s.line.itemName ?? s.line.description,
        qty: s.qty,
        uom: s.line.uom ?? null,
        customerName,
      });
    }
  }

  private async notifyShortfalls(): Promise<void> {
    const rows = this.pendingShortfalls;
    this.pendingShortfalls = [];
    if (rows.length === 0) return;
    try {
      await new StockAlertNotifier(this.ctx.db, this.ctx.tenantId).sendShortfallDigest(rows);
    } catch {
      // Swallowed on purpose — see above.
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Raise and post what the warehouse can actually cover.
   *
   * A delivery note posts whole or not at all, so a single short line used to
   * roll every other line back with it — an invoice for ten SKUs moved no
   * stock because one paneer pack was out. Now the covered quantities go out
   * on a posted DN and only the remainder is parked on a draft.
   */
  private async dispatchInvoice(
    invoiceId: string,
    warehouseId: string,
    opts: BulkDispatchOptions,
  ): Promise<AutoDispatchOutcome> {
    const dispatch = new SalesDispatchService(this.ctx);
    const { invoice, lines } = await dispatch.previewInvoice(invoiceId, warehouseId);
    const shippable = shippableLines(lines);
    if (shippable.length === 0) {
      return { status: 'skipped', reason: 'No stocked lines to dispatch' };
    }

    const at = { warehouseId, dispatchDate: dispatchDateFor(opts, invoice.invoiceDate) };
    const { ready, short } = splitByAvailability(shippable);
    // Queued whether or not the draft below survives: what makes this worth
    // telling someone is the goods being owed, not the paperwork landing.
    this.queueShortfalls(short, invoice.customerName);

    if (ready.length === 0) {
      const draft = await this.raiseDn(dispatch, invoiceId, {
        ...at, lines: short, notes: SHORTFALL_NOTE, isShortfall: true,
      });
      return {
        status: 'shortfall',
        dnId: draft.id,
        dnNo: draft.dnNo,
        shortfall: {
          dnId: draft.id,
          dnNo: draft.dnNo,
          lineCount: short.length,
          reason: shortfallReason(short),
          items: shortfallItems(short),
        },
      };
    }

    const dn = await this.raiseDn(dispatch, invoiceId, {
      ...at, lines: ready, notes: opts.notes ?? 'Auto-dispatched on invoice issue',
    });
    try {
      await new DeliveryNoteService(this.ctx).dispatch(dn.id);
    } catch (err) {
      // Draft survives on purpose — it holds the picked lines, so the queue
      // shows a half-done job to finish rather than nothing at all. The
      // shortfall stays on the invoice, which keeps it in the queue too.
      return { status: 'failed', reason: messageOf(err), dnId: dn.id, dnNo: dn.dnNo };
    }

    return {
      status: 'dispatched',
      dnId: dn.id,
      dnNo: dn.dnNo,
      lineCount: ready.length,
      ...(short.length
        ? { shortfall: await this.parkShortfall(dispatch, invoiceId, at, short) }
        : {}),
    };
  }

  /**
   * The uncovered remainder, as a draft DN the operator can post once stock
   * lands. Best-effort: the goods that did ship have already moved, and
   * losing the paperwork for the rest must not unwind that.
   */
  private async parkShortfall(
    dispatch: SalesDispatchService,
    invoiceId: string,
    at: DispatchTarget,
    short: SplitLine<PreviewLine>[],
  ): Promise<DispatchShortfall | undefined> {
    try {
      const draft = await this.raiseDn(dispatch, invoiceId, {
        ...at, lines: short, notes: SHORTFALL_NOTE, isShortfall: true,
      });
      return {
        dnId: draft.id,
        dnNo: draft.dnNo,
        lineCount: short.length,
        reason: shortfallReason(short),
        items: shortfallItems(short),
      };
    } catch {
      return undefined;
    }
  }

  private raiseDn(
    dispatch: SalesDispatchService,
    invoiceId: string,
    opts: DispatchTarget & {
      lines: SplitLine<PreviewLine>[]; notes: string; isShortfall?: boolean;
    },
  ) {
    return dispatch.createFromInvoice(invoiceId, {
      warehouseId: opts.warehouseId,
      dispatchDate: opts.dispatchDate,
      vehicleNo: null,
      lrNo: null,
      notes: opts.notes,
      lines: opts.lines.map(({ line, qty }) => ({
        itemId: line.itemId!,
        invoiceLineId: line.invoiceLineId,
        qty,
        // The preview looked for one batch big enough for the whole line. A
        // part-line needs less, so hand it back to FEFO at post time.
        batchNo: qty === line.remainingQty ? line.suggestedBatchNo ?? null : null,
        uom: line.uom ?? null,
      })),
    }, { isShortfall: opts.isShortfall ?? false });
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

/** The owed quantities, named — what a toast or a push has room to say. */
function shortfallItems(
  short: SplitLine<PreviewLine>[],
): Array<{ itemName: string; qty: number; uom: string | null }> {
  return short.map((s) => ({
    itemName: s.line.itemName ?? s.line.description,
    qty: s.qty,
    uom: s.line.uom ?? null,
  }));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SHORTFALL_NOTE = 'Auto-dispatch shortfall — awaiting stock';

/** Where and when a run's delivery notes land. */
interface DispatchTarget { warehouseId: string; dispatchDate: string }

/**
 * The same filter the confirm screen applies: lines that resolve to a stocked
 * item and still owe goods. An unmapped description or a service line is not
 * a failure — there is simply nothing to ship for it.
 */
function shippableLines(lines: PreviewLine[]): PreviewLine[] {
  return lines.filter(
    (l) => (l.resolution === 'item' || l.resolution === 'alias')
      && l.remainingQty > 0
      && l.itemId,
  );
}

/**
 * Backdating to the invoice puts the stock movement and its COGS entry on the
 * day the goods were billed, which is what a backlog being cleared after the
 * fact actually describes. FEFO still picks from stock on hand now, so the
 * closing position is right even though the history is reconstructed.
 */
function dispatchDateFor(opts: BulkDispatchOptions, invoiceDate: string): string {
  return opts.dateMode === 'invoice' ? invoiceDate : new Date().toISOString().slice(0, 10);
}

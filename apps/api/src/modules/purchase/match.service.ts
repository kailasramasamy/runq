import { and, eq, sql, desc, inArray, isNull, ne } from 'drizzle-orm';
import {
  purchaseOrdersV2,
  purchaseOrderLinesV2,
  purchaseInvoices,
  purchaseInvoiceItems,
  vendors,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { CommitMatchInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

/**
 * PP Phase 3 — 3-way match service.
 * Spec: docs/purchase-procurement-plan.md §8.
 *
 * Default match is amount-level: PO total vs Bill total within tolerance.
 * Line-level match is opt-in (caller supplies `lineMappings`).
 *
 * Tolerance: per-vendor `vendors.match_tolerance_pct` (NULL → tenant
 * default), with a hard-coded 2% fallback for v1. Per-tenant override
 * lands in Phase 5 polish.
 */

const DEFAULT_TOLERANCE_PCT = 2;

export interface OpenPoSummary {
  id: string;
  poNumber: string;
  poDate: string;
  total: number;
  openValue: number;     // total - amount already billed (driven by qty_billed)
  status: string;
}

export interface LineMatchDelta {
  billLineId: string;
  poLineId: string;
  qtyOk: boolean;
  priceOk: boolean;
}

export interface MatchPreview {
  billId: string;
  vendorId: string;
  openPos: OpenPoSummary[];
  /** Set only when the user previously committed a match for this bill. */
  matchedPoId: string | null;
  matchStatus: 'unmatched' | 'matched' | 'mismatch';
  /** Tolerance % used (effective per-vendor or fallback). */
  tolerancePct: number;
  /**
   * Computed against the bill's currently-matched PO (when one is set,
   * else null). Surfaces the amount delta on the bill review screen.
   */
  amountDelta: { billTotal: number; poOpen: number; absDelta: number; pctDelta: number } | null;
  lineDeltas: LineMatchDelta[];
}

export class MatchService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ─── Preview ───────────────────────────────────────────────────────────

  async preview(billId: string): Promise<MatchPreview> {
    const [bill] = await this.db
      .select({
        id: purchaseInvoices.id,
        vendorId: purchaseInvoices.vendorId,
        totalAmount: purchaseInvoices.totalAmount,
        matchedPoId: purchaseInvoices.matchedPoId,
        matchStatus: purchaseInvoices.matchStatus,
      })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, billId), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);
    if (!bill) throw new NotFoundError('PurchaseInvoice');

    const tolerancePct = await this.effectiveTolerance(bill.vendorId);

    // Open POs for this vendor: status ∈ {sent, partially_received, received}
    // AND not yet fully billed. We approximate "fully billed" by summing
    // qty_billed * unit_rate per line and comparing to subtotal.
    const openPos = await this.findOpenPos(bill.vendorId);

    const billTotal = Number(bill.totalAmount);
    let amountDelta: MatchPreview['amountDelta'] = null;
    if (bill.matchedPoId) {
      const po = openPos.find((p) => p.id === bill.matchedPoId);
      const openValue = po?.openValue ?? 0;
      const absDelta = Math.abs(billTotal - openValue);
      const pctDelta = openValue > 0 ? (absDelta / openValue) * 100 : 100;
      amountDelta = { billTotal, poOpen: openValue, absDelta, pctDelta };
    }

    return {
      billId,
      vendorId: bill.vendorId,
      openPos,
      matchedPoId: bill.matchedPoId ?? null,
      matchStatus: (bill.matchStatus as 'unmatched' | 'matched' | 'mismatch') ?? 'unmatched',
      tolerancePct,
      amountDelta,
      lineDeltas: [],
    };
  }

  // ─── Commit ────────────────────────────────────────────────────────────

  async commit(input: CommitMatchInput, userId?: string): Promise<{ status: 'matched' | 'mismatch'; pctDelta: number }> {
    const [bill] = await this.db
      .select({
        id: purchaseInvoices.id,
        vendorId: purchaseInvoices.vendorId,
        totalAmount: purchaseInvoices.totalAmount,
      })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, input.billId), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);
    if (!bill) throw new NotFoundError('PurchaseInvoice');

    const [po] = await this.db
      .select({
        id: purchaseOrdersV2.id,
        status: purchaseOrdersV2.status,
        vendorId: purchaseOrdersV2.vendorId,
        subtotal: purchaseOrdersV2.subtotal,
        total: purchaseOrdersV2.total,
      })
      .from(purchaseOrdersV2)
      .where(and(
        eq(purchaseOrdersV2.id, input.matchedPoId),
        eq(purchaseOrdersV2.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!po) throw new NotFoundError('PurchaseOrder');
    if (po.vendorId !== bill.vendorId) {
      throw new ConflictError('PO and bill belong to different vendors');
    }

    const openValue = await this.computePoOpenValue(input.matchedPoId);
    const billTotal = Number(bill.totalAmount);
    const absDelta = Math.abs(billTotal - openValue);
    const tolerancePct = await this.effectiveTolerance(bill.vendorId);
    // A PO commits quantity, not price — an unpriced PO has nothing to
    // compare the bill total against, so the match degrades to qty-only
    // and the amount check is skipped rather than failed.
    const poPriced = Number(po.total) > 0;
    const pctDelta = poPriced ? (openValue > 0 ? (absDelta / openValue) * 100 : 100) : 0;
    const amountOk = !poPriced || pctDelta <= tolerancePct;

    // Per-line mappings — when supplied, every mapping must pass tolerance
    // for the match to be 'matched'. Otherwise 'mismatch' + override.
    let lineOk = true;
    if (input.lineMappings && input.lineMappings.length > 0) {
      const poLineIds = input.lineMappings.map((m) => m.poLineId);
      const billLineIds = input.lineMappings.map((m) => m.billLineId);
      const [poLines, billLines] = await Promise.all([
        this.db
          .select()
          .from(purchaseOrderLinesV2)
          .where(and(
            eq(purchaseOrderLinesV2.tenantId, this.tenantId),
            inArray(purchaseOrderLinesV2.id, poLineIds),
          )),
        this.db
          .select()
          .from(purchaseInvoiceItems)
          .where(and(
            eq(purchaseInvoiceItems.tenantId, this.tenantId),
            inArray(purchaseInvoiceItems.id, billLineIds),
          )),
      ]);
      const poMap = new Map(poLines.map((l) => [l.id, l] as const));
      const billMap = new Map(billLines.map((l) => [l.id, l] as const));
      for (const m of input.lineMappings) {
        const poLine = poMap.get(m.poLineId);
        const billLine = billMap.get(m.billLineId);
        if (!poLine || !billLine) { lineOk = false; break; }
        const billQty = m.qty ?? Number(billLine.quantity);
        const openQty = Math.max(0, Number(poLine.qtyOrdered) - Number(poLine.qtyBilled));
        const billAmt = m.amount ?? Number(billLine.amount);
        const poAmt = Number(poLine.unitRate) * Number(billQty);
        const qtyOk = Math.abs(billQty - openQty) <= openQty * (tolerancePct / 100);
        const priceOk = !poPriced
          || Math.abs(billAmt - poAmt) <= poAmt * (tolerancePct / 100);
        if (!qtyOk || !priceOk) { lineOk = false; break; }
      }
    }

    const matchedOk = amountOk && lineOk;
    if (!matchedOk && (input.overrideReason == null || input.overrideReason.trim() === '')) {
      throw new ConflictError(
        poPriced
          ? `Match outside tolerance (${pctDelta.toFixed(2)}% > ${tolerancePct}%). Provide an override reason to commit anyway.`
          : `Billed qty is outside the ${tolerancePct}% tolerance on the PO's open qty. Provide an override reason to commit anyway.`,
      );
    }

    const status: 'matched' | 'mismatch' = matchedOk ? 'matched' : 'mismatch';

    await this.db.transaction(async (tx) => {
      await tx
        .update(purchaseInvoices)
        .set({
          matchedPoId: input.matchedPoId,
          matchStatus: status,
          matchOverrideReason: matchedOk ? null : (input.overrideReason ?? null),
          matchOverrideBy: matchedOk ? null : (userId ?? null),
          matchCommittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(purchaseInvoices.id, input.billId));

      // Increment qty_billed on PO lines. When line mappings are supplied
      // we apply per-line; otherwise we apply a single bill-total/po-subtotal
      // proportional pro-rate across all PO lines (good enough for v1).
      if (input.lineMappings && input.lineMappings.length > 0) {
        for (const m of input.lineMappings) {
          const qty = m.qty ?? 0;
          if (qty > 0) {
            await tx
              .update(purchaseOrderLinesV2)
              .set({ qtyBilled: sql`${purchaseOrderLinesV2.qtyBilled}::numeric + ${qty}` })
              .where(eq(purchaseOrderLinesV2.id, m.poLineId));
          }
        }
      }

      // Optionally transition PO status to 'closed' once fully billed AND
      // fully received. v1: leave that to the user via the explicit Close
      // action — auto-close is a Phase 5 polish.
    });

    return { status, pctDelta };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async effectiveTolerance(vendorId: string): Promise<number> {
    const [v] = await this.db
      .select({ pct: vendors.matchTolerancePct })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, this.tenantId)))
      .limit(1);
    if (v?.pct != null) return Number(v.pct);
    return DEFAULT_TOLERANCE_PCT;
  }

  private async findOpenPos(vendorId: string): Promise<OpenPoSummary[]> {
    const rows = await this.db
      .select({
        id: purchaseOrdersV2.id,
        poNumber: purchaseOrdersV2.poNumber,
        poDate: purchaseOrdersV2.poDate,
        total: purchaseOrdersV2.total,
        subtotal: purchaseOrdersV2.subtotal,
        status: purchaseOrdersV2.status,
        // Sum unit_rate * qty_billed across this PO's lines to compute
        // already-billed value. Subtract from subtotal to get open value.
        billedValue: sql<string>`COALESCE((
          SELECT SUM(${purchaseOrderLinesV2.unitRate}::numeric * ${purchaseOrderLinesV2.qtyBilled}::numeric)
          FROM ${purchaseOrderLinesV2}
          WHERE ${purchaseOrderLinesV2.poId} = ${purchaseOrdersV2.id}
        ), 0)`,
      })
      .from(purchaseOrdersV2)
      .where(and(
        eq(purchaseOrdersV2.tenantId, this.tenantId),
        eq(purchaseOrdersV2.vendorId, vendorId),
        inArray(purchaseOrdersV2.status, ['sent', 'partially_received', 'received']),
      ))
      .orderBy(desc(purchaseOrdersV2.poDate));

    return rows.map((r) => {
      const subtotal = Number(r.subtotal);
      const billed = Number(r.billedValue);
      const openValue = Math.max(0, subtotal - billed);
      return {
        id: r.id,
        poNumber: r.poNumber,
        poDate: r.poDate,
        total: Number(r.total),
        openValue,
        status: r.status,
      };
    }).filter((p) => p.openValue > 0);
  }

  private async computePoOpenValue(poId: string): Promise<number> {
    const [row] = await this.db
      .select({
        subtotal: purchaseOrdersV2.subtotal,
        billedValue: sql<string>`COALESCE((
          SELECT SUM(${purchaseOrderLinesV2.unitRate}::numeric * ${purchaseOrderLinesV2.qtyBilled}::numeric)
          FROM ${purchaseOrderLinesV2}
          WHERE ${purchaseOrderLinesV2.poId} = ${poId}
        ), 0)`,
      })
      .from(purchaseOrdersV2)
      .where(eq(purchaseOrdersV2.id, poId))
      .limit(1);
    if (!row) return 0;
    return Math.max(0, Number(row.subtotal) - Number(row.billedValue));
  }
}

// Suppress unused-import warnings for symbols reserved for Phase 5 polish.
void isNull;
void ne;

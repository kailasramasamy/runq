import { and, eq, desc, gte, lte, sql, ilike, inArray } from 'drizzle-orm';
import {
  purchaseOrdersV2,
  purchaseOrderLinesV2,
  vendors,
  tenants,
  inventoryGrns,
  purchaseInvoices,
  documentAttachments,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderWithLines,
  PurchaseOrderStatus,
} from '@runq/types';
import type {
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ClosePurchaseOrderInput,
  CancelPurchaseOrderInput,
  PurchaseOrderFilter,
} from '@runq/validators';
import { PURCHASE_ORDER_STATUS_VALUES } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { planLineAmend, statusFromLines } from './po-line-amend';

type PoLineInput = NonNullable<UpdatePurchaseOrderInput['lines']>[number];

/** Statuses a PO can be edited in; received/closed/cancelled are history. */
const EDITABLE_STATUSES: PurchaseOrderStatus[] = ['draft', 'sent', 'partially_received'];

/** Once sent, the vendor holds the PO — its vendor and date can't move. */
function assertHeaderUnchanged(po: PurchaseOrderWithLines, input: UpdatePurchaseOrderInput) {
  if (input.vendorId !== undefined && input.vendorId !== po.vendorId) {
    throw new ConflictError('The vendor can\'t be changed after the PO is sent');
  }
  if (input.poDate !== undefined && input.poDate !== po.poDate) {
    throw new ConflictError('The PO date can\'t be changed after the PO is sent');
  }
}

function headerPatch(input: UpdatePurchaseOrderInput): Partial<typeof purchaseOrdersV2.$inferInsert> {
  const patch: Partial<typeof purchaseOrdersV2.$inferInsert> = { updatedAt: new Date() };
  if (input.vendorId !== undefined) patch.vendorId = input.vendorId;
  if (input.poDate !== undefined) patch.poDate = input.poDate;
  if (input.expectedDate !== undefined) patch.expectedDate = input.expectedDate ?? null;
  if (input.deliveryAddress !== undefined) patch.deliveryAddress = input.deliveryAddress ?? null;
  if (input.paymentTerms !== undefined) patch.paymentTerms = input.paymentTerms ?? null;
  if (input.notes !== undefined) patch.notes = input.notes ?? null;
  return patch;
}

/** Header money derived from the lines, so a stale total can't survive an edit. */
function totalsOf(lines: PoLineInput[]) {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const taxTotal = lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
  return { subtotal: String(subtotal), taxTotal: String(taxTotal), total: String(subtotal + taxTotal) };
}

function lineValues(l: PoLineInput, lineNo: number) {
  return {
    lineNo,
    description: l.description,
    catalogItemId: l.catalogItemId ?? null,
    uom: l.uom ?? null,
    hsnSacCode: l.hsnSacCode ?? null,
    qtyOrdered: String(l.qtyOrdered),
    unitRate: String(l.unitRate),
    amount: String(l.amount),
    taxRate: l.taxRate != null ? String(l.taxRate) : null,
    taxAmount: l.taxAmount != null ? String(l.taxAmount) : null,
    notes: l.notes ?? null,
  };
}

/**
 * PP Phase 1 — Purchase Order CRUD + status transitions.
 * Spec: docs/purchase-procurement-plan.md §5.1.
 *
 * PO numbering: `PO-YYYY-NNNN` per tenant per year. Sequence reads the
 * MAX existing number for the year and increments — race-tolerant because
 * the (tenant_id, po_number) unique index would reject duplicates and the
 * caller can retry; for SME write volume (a few POs/day) the simple read
 * + increment is correct.
 */

export interface PurchaseOrderListResult {
  /** billedTotal: sum of bills matched to the PO — the PO's value once priced at receipt / invoice. */
  data: Array<PurchaseOrder & { vendorName: string; lineCount: number; billedTotal: number }>;
  meta: PaginationMeta;
}

type Status = (typeof PURCHASE_ORDER_STATUS_VALUES)[number];

export class PurchaseOrderService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(
    filters: PurchaseOrderFilter,
    pagination: { page: number; limit: number },
  ): Promise<PurchaseOrderListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const where = this.buildWhereClause(filters);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          po: purchaseOrdersV2,
          vendorName: vendors.name,
          lineCount: sql<number>`(SELECT count(*)::int FROM ${purchaseOrderLinesV2} WHERE ${purchaseOrderLinesV2.poId} = ${purchaseOrdersV2.id})`,
        })
        .from(purchaseOrdersV2)
        .innerJoin(vendors, eq(vendors.id, purchaseOrdersV2.vendorId))
        .where(where)
        .orderBy(desc(purchaseOrdersV2.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(purchaseOrdersV2)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    const billed = await this.billedTotals(rows.map((r) => r.po.id));
    return {
      data: rows.map((r) => ({
        ...this.toPO(r.po),
        vendorName: r.vendorName,
        lineCount: r.lineCount,
        billedTotal: billed.get(r.po.id) ?? 0,
      })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  /**
   * GRNs + bills linked to this PO. Used by the PO detail "Linked
   * documents" card. Bills include those matched via 3-way match and
   * those created via Phase-5 scan-on-receive (matched_po_id set).
   */
  async linkedDocuments(poId: string): Promise<{
    grns: Array<{ id: string; grnNo: string; receivedDate: string; source: string; totalValue: number; status: string; billId: string | null }>;
    bills: Array<{ id: string; invoiceNumber: string; invoiceDate: string; totalAmount: number; status: string }>;
    attachments: Array<{ id: string; billId: string; fileName: string; mimeType: string; fileSize: number; createdAt: string }>;
  }> {
    await this.assertExists(poId);
    const grnRows = await this.db
      .select({
        id: inventoryGrns.id, grnNo: inventoryGrns.grnNo,
        receivedDate: inventoryGrns.receivedDate, source: inventoryGrns.source,
        totalValue: inventoryGrns.totalValue, status: inventoryGrns.status,
        billId: inventoryGrns.billId,
        // When the GRN is bound to a vendor bill (scan-receive flow), the
        // user's mental model is "the invoiced amount" — i.e. with tax.
        // Surface that here so the UI doesn't show goods-only ₹X on a row
        // the rest of the screen totals at ₹X + tax.
        billTotal: purchaseInvoices.totalAmount,
      })
      .from(inventoryGrns)
      .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, inventoryGrns.billId))
      .where(and(eq(inventoryGrns.tenantId, this.tenantId), eq(inventoryGrns.poId, poId)))
      .orderBy(desc(inventoryGrns.receivedDate));
    const billRows = await this.db
      .select({
        id: purchaseInvoices.id, invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate, totalAmount: purchaseInvoices.totalAmount,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        eq(purchaseInvoices.matchedPoId, poId),
      ))
      .orderBy(desc(purchaseInvoices.invoiceDate));

    const billIds = billRows.map((b) => b.id);
    const attachmentRows = billIds.length === 0
      ? []
      : await this.db
          .select({
            id: documentAttachments.id,
            entityId: documentAttachments.entityId,
            fileName: documentAttachments.fileName,
            mimeType: documentAttachments.mimeType,
            fileSize: documentAttachments.fileSize,
            createdAt: documentAttachments.createdAt,
          })
          .from(documentAttachments)
          .where(and(
            eq(documentAttachments.tenantId, this.tenantId),
            eq(documentAttachments.entityType, 'purchase_invoice'),
            inArray(documentAttachments.entityId, billIds),
          ))
          .orderBy(desc(documentAttachments.createdAt));

    return {
      grns: grnRows.map((r) => ({
        id: r.id, grnNo: r.grnNo, receivedDate: r.receivedDate,
        source: r.source, status: r.status, billId: r.billId ?? null,
        // Prefer the linked bill total (incl. tax) over the GRN's goods-
        // only valuation. Falls back to GRN totalValue when no bill yet.
        totalValue: r.billTotal != null ? Number(r.billTotal) : Number(r.totalValue),
      })),
      bills: billRows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount) })),
      attachments: attachmentRows.map((a) => ({
        id: a.id, billId: a.entityId, fileName: a.fileName,
        mimeType: a.mimeType, fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  private async assertExists(poId: string): Promise<void> {
    const [row] = await this.db.select({ id: purchaseOrdersV2.id })
      .from(purchaseOrdersV2)
      .where(and(eq(purchaseOrdersV2.id, poId), eq(purchaseOrdersV2.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('PurchaseOrder');
  }

  async getForPrint(id: string) {
    const [row] = await this.db
      .select({ po: purchaseOrdersV2, vendor: vendors, tenant: tenants })
      .from(purchaseOrdersV2)
      .innerJoin(vendors, eq(vendors.id, purchaseOrdersV2.vendorId))
      .innerJoin(tenants, eq(tenants.id, purchaseOrdersV2.tenantId))
      .where(and(
        eq(purchaseOrdersV2.id, id),
        eq(purchaseOrdersV2.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('PurchaseOrder');
    const lineRows = await this.db
      .select()
      .from(purchaseOrderLinesV2)
      .where(eq(purchaseOrderLinesV2.poId, id))
      .orderBy(purchaseOrderLinesV2.lineNo);
    return {
      po: this.toPO(row.po),
      lines: lineRows.map((l) => this.toLine(l)),
      vendor: row.vendor,
      tenant: row.tenant,
    };
  }

  async getById(id: string): Promise<PurchaseOrderWithLines> {
    const [row] = await this.db
      .select({ po: purchaseOrdersV2, vendorName: vendors.name })
      .from(purchaseOrdersV2)
      .innerJoin(vendors, eq(vendors.id, purchaseOrdersV2.vendorId))
      .where(and(
        eq(purchaseOrdersV2.id, id),
        eq(purchaseOrdersV2.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('PurchaseOrder');

    const lines = await this.db
      .select()
      .from(purchaseOrderLinesV2)
      .where(eq(purchaseOrderLinesV2.poId, id))
      .orderBy(purchaseOrderLinesV2.lineNo);

    return {
      ...this.toPO(row.po),
      vendorName: row.vendorName,
      lines: lines.map((l) => this.toLine(l)),
    };
  }

  async create(input: CreatePurchaseOrderInput, userId?: string): Promise<PurchaseOrderWithLines> {
    // `nextPoNumber` is read-then-increment, so two near-simultaneous
    // creates within the same tenant can race to the same number and
    // trip `uq_po_v2_tenant_number`. Retry a few times — each iteration
    // re-reads MAX so it converges quickly.
    const MAX_ATTEMPTS = 5;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const poNumber = await this.nextPoNumber(input.poDate);
      try {
        const result = await this.db.transaction(async (tx) => {
          const [po] = await tx
            .insert(purchaseOrdersV2)
            .values({
              tenantId: this.tenantId,
              poNumber,
              vendorId: input.vendorId,
              poDate: input.poDate,
              expectedDate: input.expectedDate ?? null,
              deliveryAddress: input.deliveryAddress ?? null,
              paymentTerms: input.paymentTerms ?? null,
              notes: input.notes ?? null,
              status: 'draft',
              subtotal: String(input.subtotal),
              taxTotal: String(input.taxTotal ?? 0),
              total: String(input.total),
              createdBy: userId ?? null,
            })
            .returning();

          await tx.insert(purchaseOrderLinesV2).values(
            input.lines.map((l, i) => ({
              tenantId: this.tenantId,
              poId: po!.id,
              lineNo: i + 1,
              description: l.description,
              catalogItemId: l.catalogItemId ?? null,
              uom: l.uom ?? null,
              hsnSacCode: l.hsnSacCode ?? null,
              qtyOrdered: String(l.qtyOrdered),
              unitRate: String(l.unitRate),
              amount: String(l.amount),
              taxRate: l.taxRate != null ? String(l.taxRate) : null,
              taxAmount: l.taxAmount != null ? String(l.taxAmount) : null,
              notes: l.notes ?? null,
            })),
          );
          return po!;
        });
        return this.getById(result.id);
      } catch (err) {
        lastErr = err;
        // Match on any 23505 in the create flow — the only unique
        // constraint on `purchase_orders_v2` is `uq_po_v2_tenant_number`
        // (see migration 0117), and any nested causes (drizzle wrappers,
        // postgres.js shapes) all expose the SQLSTATE on the surface.
        const code = (err as { code?: string })?.code
          ?? (err as { cause?: { code?: string } })?.cause?.code;
        if (code === '23505') {
          // eslint-disable-next-line no-console
          console.warn(`[po.create] po_number ${poNumber} collided, retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('Failed to allocate a unique PO number after retries');
  }

  /**
   * Edit a PO. A draft is fully editable. Once sent (or partly received) the
   * vendor already holds it, so vendor and PO date are fixed; lines can be
   * amended in place or added — never below what's been received or billed,
   * and a line with receipts/bills can't be removed. Received, closed and
   * cancelled POs are read-only.
   */
  async update(id: string, input: UpdatePurchaseOrderInput): Promise<PurchaseOrderWithLines> {
    const existing = await this.getById(id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new ConflictError(`A ${existing.status.replace('_', ' ')} PO can't be edited`);
    }
    const isDraft = existing.status === 'draft';
    if (!isDraft) assertHeaderUnchanged(existing, input);

    await this.db.transaction(async (tx) => {
      const patch = headerPatch(input);
      if (input.lines) {
        await this.amendLines(tx as unknown as Db, id, existing.lines, input.lines);
        Object.assign(patch, totalsOf(input.lines));
        if (!isDraft) patch.status = await this.statusAfterAmend(tx as unknown as Db, id);
      }
      await tx
        .update(purchaseOrdersV2)
        .set(patch)
        .where(and(eq(purchaseOrdersV2.id, id), eq(purchaseOrdersV2.tenantId, this.tenantId)));
    });

    return this.getById(id);
  }

  /** Update kept lines in place, insert new ones, drop removed ones; renumber in the given order. */
  private async amendLines(
    db: Db, poId: string, current: PurchaseOrderLine[], lines: NonNullable<UpdatePurchaseOrderInput['lines']>,
  ) {
    const plan = planLineAmend(current, lines);
    if (plan.remove.length) {
      await db.delete(purchaseOrderLinesV2).where(inArray(purchaseOrderLinesV2.id, plan.remove));
    }
    for (const [i, l] of lines.entries()) {
      const values = lineValues(l, i + 1);
      if (l.id) {
        await db.update(purchaseOrderLinesV2).set(values).where(eq(purchaseOrderLinesV2.id, l.id));
      } else {
        await db.insert(purchaseOrderLinesV2).values({ ...values, tenantId: this.tenantId, poId });
      }
    }
  }

  private async statusAfterAmend(db: Db, poId: string) {
    const rows = await db
      .select({ qtyOrdered: purchaseOrderLinesV2.qtyOrdered, qtyReceived: purchaseOrderLinesV2.qtyReceived })
      .from(purchaseOrderLinesV2)
      .where(eq(purchaseOrderLinesV2.poId, poId));
    return statusFromLines(rows.map((r) => ({ qtyOrdered: Number(r.qtyOrdered), qtyReceived: Number(r.qtyReceived) })));
  }

  async send(id: string, userId?: string): Promise<PurchaseOrderWithLines> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft') {
      throw new ConflictError(`PO must be in draft to send (current: ${existing.status})`);
    }
    if (existing.lines.length === 0) {
      throw new ConflictError('Cannot send a PO with no line items');
    }

    await this.db
      .update(purchaseOrdersV2)
      .set({
        status: 'sent',
        sentAt: new Date(),
        approvedBy: userId ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseOrdersV2.id, id), eq(purchaseOrdersV2.tenantId, this.tenantId)));

    return this.getById(id);
  }

  async close(id: string, input: ClosePurchaseOrderInput): Promise<PurchaseOrderWithLines> {
    const existing = await this.getById(id);
    // Closeable from sent / partially_received / received. Drafts → cancel,
    // not close (no commitment was ever made).
    if (!['sent', 'partially_received', 'received'].includes(existing.status)) {
      throw new ConflictError(`PO cannot be closed from ${existing.status} (use cancel for draft)`);
    }

    await this.db
      .update(purchaseOrdersV2)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closedReason: input.reason,
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseOrdersV2.id, id), eq(purchaseOrdersV2.tenantId, this.tenantId)));

    return this.getById(id);
  }

  async cancel(id: string, input: CancelPurchaseOrderInput): Promise<PurchaseOrderWithLines> {
    const existing = await this.getById(id);
    if (existing.status === 'cancelled' || existing.status === 'closed') {
      throw new ConflictError(`PO is already ${existing.status}`);
    }
    // Phase 1: no GRN linkage to guard against (Phase 2 adds the check
    // "cancelled with open GRNs → block, force unlink first").

    await this.db
      .update(purchaseOrdersV2)
      .set({
        status: 'cancelled',
        closedAt: new Date(),
        closedReason: input.reason ?? 'Cancelled',
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseOrdersV2.id, id), eq(purchaseOrdersV2.tenantId, this.tenantId)));

    return this.getById(id);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async nextPoNumber(poDate: string): Promise<string> {
    const year = poDate.slice(0, 4);
    const prefix = `PO-${year}-`;
    // Lexicographic MAX is fragile when padding isn't perfectly consistent
    // across legacy data (e.g. `PO-2026-9` vs `PO-2026-0009`). Cast the
    // tail to int and pick the numeric MAX so the next number is always
    // strictly greater than every existing PO for this tenant + year.
    const [row] = await this.db
      .select({
        maxN: sql<number | null>`MAX(
          CASE
            WHEN ${purchaseOrdersV2.poNumber} ~ ('^' || ${prefix} || '[0-9]+$')
            THEN substring(${purchaseOrdersV2.poNumber} from char_length(${prefix}) + 1)::int
            ELSE NULL
          END
        )`,
      })
      .from(purchaseOrdersV2)
      .where(and(
        eq(purchaseOrdersV2.tenantId, this.tenantId),
        ilike(purchaseOrdersV2.poNumber, `${prefix}%`),
      ));
    const next = (row?.maxN ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private buildWhereClause(filters: PurchaseOrderFilter) {
    const statusParts = filters.status
      ? filters.status.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    return and(
      eq(purchaseOrdersV2.tenantId, this.tenantId),
      filters.vendorId ? eq(purchaseOrdersV2.vendorId, filters.vendorId) : undefined,
      statusParts.length === 1
        ? eq(purchaseOrdersV2.status, statusParts[0] as Status)
        : statusParts.length > 1
          ? inArray(purchaseOrdersV2.status, statusParts as Status[])
          : undefined,
      filters.search
        ? sql`(${purchaseOrdersV2.poNumber} ILIKE ${'%' + filters.search + '%'} OR EXISTS (SELECT 1 FROM ${vendors} WHERE ${vendors.id} = ${purchaseOrdersV2.vendorId} AND ${vendors.name} ILIKE ${'%' + filters.search + '%'}))`
        : undefined,
      filters.dateFrom ? gte(purchaseOrdersV2.poDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(purchaseOrdersV2.poDate, filters.dateTo) : undefined,
    );
  }

  /** Sum of non-cancelled bills matched to each PO (POs carry qty, bills carry price). */
  private async billedTotals(poIds: string[]): Promise<Map<string, number>> {
    if (!poIds.length) return new Map();
    const rows = await this.db
      .select({ poId: purchaseInvoices.matchedPoId, total: sql<string>`sum(${purchaseInvoices.totalAmount})` })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        inArray(purchaseInvoices.matchedPoId, poIds),
        sql`${purchaseInvoices.status} not in ('draft', 'cancelled')`,
      ))
      .groupBy(purchaseInvoices.matchedPoId);
    return new Map(rows.map((r) => [r.poId!, Number(r.total)]));
  }

  private toPO(row: typeof purchaseOrdersV2.$inferSelect): PurchaseOrder {
    return {
      id: row.id,
      tenantId: row.tenantId,
      poNumber: row.poNumber,
      vendorId: row.vendorId,
      poDate: row.poDate,
      expectedDate: row.expectedDate ?? null,
      deliveryAddress: row.deliveryAddress ?? null,
      paymentTerms: row.paymentTerms ?? null,
      notes: row.notes ?? null,
      status: row.status as PurchaseOrderStatus,
      sourcePrId: row.sourcePrId ?? null,
      subtotal: Number(row.subtotal),
      taxTotal: Number(row.taxTotal),
      total: Number(row.total),
      createdBy: row.createdBy ?? null,
      approvedBy: row.approvedBy ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      closedReason: row.closedReason ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toLine(row: typeof purchaseOrderLinesV2.$inferSelect): PurchaseOrderLine {
    return {
      id: row.id,
      tenantId: row.tenantId,
      poId: row.poId,
      lineNo: row.lineNo,
      description: row.description,
      catalogItemId: row.catalogItemId ?? null,
      uom: row.uom ?? null,
      hsnSacCode: row.hsnSacCode ?? null,
      qtyOrdered: Number(row.qtyOrdered),
      unitRate: Number(row.unitRate),
      amount: Number(row.amount),
      taxRate: row.taxRate != null ? Number(row.taxRate) : null,
      taxAmount: row.taxAmount != null ? Number(row.taxAmount) : null,
      qtyReceived: Number(row.qtyReceived),
      qtyBilled: Number(row.qtyBilled),
      notes: row.notes ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

import { eq, and, sql, gte, lte, desc, inArray } from 'drizzle-orm';
import {
  poUploads,
  poDrafts,
  poDraftLines,
  customers,
  customerSkuAliases,
  items,
  salesInvoices,
  applyPagination,
  calcTotalPages,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateSalesInvoiceInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { PriceResolverService } from '../masters/price-resolver.service';
import { InvoiceService } from './invoice.service';

type PoUploadRow = typeof poUploads.$inferSelect;
type PoDraftRow = typeof poDrafts.$inferSelect;
type PoDraftLineRow = typeof poDraftLines.$inferSelect;

type PoUploadStatus = PoUploadRow['status'];
type PoDraftReviewStatus = PoDraftRow['reviewStatus'];
type PoSourceChannel = PoUploadRow['source'];

export interface InboxListParams {
  page: number;
  limit: number;
  filters: {
    /** Logical inbox status — collapses upload + draft state into one filter chip. */
    status?: 'all' | 'pending' | 'ready' | 'needs_review' | 'error' | 'approved' | 'rejected';
    customerId?: string;
    source?: PoSourceChannel;
    dateFrom?: string;
    dateTo?: string;
  };
}

export interface InboxRow {
  id: string;                          // po_upload id (always present)
  draftId: string | null;              // po_draft id (null while parsing/error)
  source: PoSourceChannel;
  uploadStatus: PoUploadStatus;
  reviewStatus: PoDraftReviewStatus | null;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
  hasRawText: boolean;
  errorMessage: string | null;
  // Parsed header fields (null while pending/parsing)
  customerId: string | null;
  customerName: string | null;
  buyerNameRaw: string | null;
  poNumberExtracted: string | null;
  poDate: string | null;
  grandTotal: string | null;
  // Bookkeeping
  uploadedAt: string;
  updatedAt: string;
}

export interface InboxListResult {
  data: InboxRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PoDraftDetail extends InboxRow {
  sourceMetadata: unknown;
  customerMatchSource: PoDraftRow['customerMatchSource'];
  customerMatchConfidence: string | null;
  buyerGstinRaw: string | null;
  deliveryDate: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  reviewFlags: unknown;
  approvedInvoiceId: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  llmModel: string | null;
  /** Full pasted text content for paste_text uploads — null for file uploads. */
  rawText: string | null;
  lines: PoDraftLineRow[];
}

/**
 * Read-side service for the PO Inbox.
 *
 * The inbox is presented to the user as a single worklist, but in the schema
 * a row may exist as a po_uploads row alone (still parsing or in error) OR
 * as a po_uploads + po_drafts pair (parsed, ready, reviewed, approved, etc.).
 * This service hides that distinction by always returning a unified
 * `InboxRow` shape via a LEFT JOIN.
 */
export class PoDraftService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async listInbox(params: InboxListParams): Promise<InboxListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);
    const where = this.buildInboxWhere(filters);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          id: poUploads.id,
          source: poUploads.source,
          uploadStatus: poUploads.status,
          fileName: poUploads.fileName,
          fileMime: poUploads.fileMime,
          fileSize: poUploads.fileSize,
          hasRawText: sql<boolean>`${poUploads.rawText} IS NOT NULL`,
          errorMessage: poUploads.errorMessage,
          uploadedAt: poUploads.createdAt,
          uploadUpdatedAt: poUploads.updatedAt,
          draftId: poDrafts.id,
          reviewStatus: poDrafts.reviewStatus,
          customerId: poDrafts.customerId,
          customerName: customers.name,
          buyerNameRaw: poDrafts.buyerNameRaw,
          poNumberExtracted: poDrafts.poNumberExtracted,
          poDate: poDrafts.poDate,
          grandTotal: poDrafts.grandTotal,
          draftUpdatedAt: poDrafts.updatedAt,
        })
        .from(poUploads)
        .leftJoin(poDrafts, eq(poDrafts.poUploadId, poUploads.id))
        .leftJoin(customers, eq(customers.id, poDrafts.customerId))
        .where(where)
        .orderBy(desc(poUploads.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(poUploads)
        .leftJoin(poDrafts, eq(poDrafts.poUploadId, poUploads.id))
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;

    const data: InboxRow[] = rows.map((r) => ({
      id: r.id,
      draftId: r.draftId,
      source: r.source,
      uploadStatus: r.uploadStatus,
      reviewStatus: r.reviewStatus,
      fileName: r.fileName,
      fileMime: r.fileMime,
      fileSize: r.fileSize,
      hasRawText: r.hasRawText,
      errorMessage: r.errorMessage,
      customerId: r.customerId,
      customerName: r.customerName,
      buyerNameRaw: r.buyerNameRaw,
      poNumberExtracted: r.poNumberExtracted,
      poDate: r.poDate,
      grandTotal: r.grandTotal,
      uploadedAt: r.uploadedAt.toISOString(),
      updatedAt: (r.draftUpdatedAt ?? r.uploadUpdatedAt).toISOString(),
    }));

    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(uploadId: string): Promise<PoDraftDetail> {
    const [row] = await this.db
      .select({
        upload: poUploads,
        draft: poDrafts,
        customerName: customers.name,
      })
      .from(poUploads)
      .leftJoin(poDrafts, eq(poDrafts.poUploadId, poUploads.id))
      .leftJoin(customers, eq(customers.id, poDrafts.customerId))
      .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('PoUpload');

    const lines: PoDraftLineRow[] = row.draft
      ? await this.db
          .select()
          .from(poDraftLines)
          .where(
            and(
              eq(poDraftLines.poDraftId, row.draft.id),
              eq(poDraftLines.tenantId, this.tenantId),
            ),
          )
          .orderBy(poDraftLines.lineIndex)
      : [];

    const u = row.upload;
    const d = row.draft;

    return {
      id: u.id,
      draftId: d?.id ?? null,
      source: u.source,
      uploadStatus: u.status,
      reviewStatus: d?.reviewStatus ?? null,
      fileName: u.fileName,
      fileMime: u.fileMime,
      fileSize: u.fileSize,
      hasRawText: u.rawText !== null,
      errorMessage: u.errorMessage,
      customerId: d?.customerId ?? null,
      customerName: row.customerName,
      buyerNameRaw: d?.buyerNameRaw ?? null,
      poNumberExtracted: d?.poNumberExtracted ?? null,
      poDate: d?.poDate ?? null,
      grandTotal: d?.grandTotal ?? null,
      uploadedAt: u.createdAt.toISOString(),
      updatedAt: (d?.updatedAt ?? u.updatedAt).toISOString(),
      sourceMetadata: u.sourceMetadata,
      customerMatchSource: d?.customerMatchSource ?? null,
      customerMatchConfidence: d?.customerMatchConfidence ?? null,
      buyerGstinRaw: d?.buyerGstinRaw ?? null,
      deliveryDate: d?.deliveryDate ?? null,
      subtotal: d?.subtotal ?? null,
      taxTotal: d?.taxTotal ?? null,
      reviewFlags: d?.reviewFlags,
      approvedInvoiceId: d?.approvedInvoiceId ?? null,
      approvedAt: d?.approvedAt?.toISOString() ?? null,
      rejectedReason: d?.rejectedReason ?? null,
      rejectedAt: d?.rejectedAt?.toISOString() ?? null,
      llmModel: d?.llmModel ?? null,
      rawText: u.rawText,
      lines,
    };
  }

  /**
   * Maps the user-facing inbox status filter to the underlying
   * (uploadStatus, reviewStatus) pair. Returns the WHERE fragment.
   */
  private buildInboxWhere(filters: InboxListParams['filters']) {
    const conds = [
      eq(poUploads.tenantId, this.tenantId),
      // Always exclude discarded uploads — they're soft-deleted and
      // shouldn't appear in any inbox view.
      sql`${poUploads.status} != 'discarded'`,
    ];

    if (filters.status && filters.status !== 'all') {
      conds.push(this.statusFilter(filters.status));
    }

    if (filters.customerId) {
      conds.push(eq(poDrafts.customerId, filters.customerId));
    }

    if (filters.source) {
      conds.push(eq(poUploads.source, filters.source));
    }

    if (filters.dateFrom) {
      conds.push(gte(poUploads.createdAt, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      conds.push(lte(poUploads.createdAt, new Date(filters.dateTo)));
    }

    return and(...conds);
  }

  private statusFilter(status: Exclude<NonNullable<InboxListParams['filters']['status']>, 'all'>) {
    switch (status) {
      case 'pending':
        return inArray(poUploads.status, ['pending', 'parsing'] as PoUploadStatus[]);
      case 'error':
        return eq(poUploads.status, 'parse_error');
      case 'ready':
        return eq(poDrafts.reviewStatus, 'ready');
      case 'needs_review':
        return eq(poDrafts.reviewStatus, 'needs_review');
      case 'approved':
        return eq(poDrafts.reviewStatus, 'approved');
      case 'rejected':
        return eq(poDrafts.reviewStatus, 'rejected');
    }
  }

  // ─── Mutations: review-screen edits ────────────────────────────────────

  /**
   * Look up a draft by upload id (the id used in URLs is the po_uploads id —
   * the upload row is the canonical inbox handle, the draft is its parsed
   * companion). Used as a guard before any mutation.
   */
  private async loadDraftByUploadId(
    uploadId: string,
  ): Promise<{ draft: PoDraftRow; upload: PoUploadRow }> {
    const [row] = await this.db
      .select({ draft: poDrafts, upload: poUploads })
      .from(poUploads)
      .innerJoin(poDrafts, eq(poDrafts.poUploadId, poUploads.id))
      .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('PoDraft');
    return row;
  }

  /**
   * Update header fields on a draft (customer, PO number, dates).
   * No line-item side-effects — the user can re-resolve rates by editing
   * each line, or trigger a full reparse from the inbox.
   */
  async update(uploadId: string, input: {
    customerId?: string | null;
    poNumberExtracted?: string | null;
    poDate?: string | null;
    deliveryDate?: string | null;
  }): Promise<PoDraftRow> {
    const { draft } = await this.loadDraftByUploadId(uploadId);
    if (draft.reviewStatus === 'approved' || draft.reviewStatus === 'rejected') {
      throw new ConflictError(`Draft is ${draft.reviewStatus} and cannot be edited`);
    }

    const patch: Partial<typeof poDrafts.$inferInsert> = { updatedAt: new Date() };
    if (input.customerId !== undefined) {
      patch.customerId = input.customerId;
      // Manual customer pick is the highest signal — outrank the parser's guess.
      patch.customerMatchSource = input.customerId ? 'manual' : null;
      patch.customerMatchConfidence = input.customerId ? '1.00' : null;
    }
    if (input.poNumberExtracted !== undefined) patch.poNumberExtracted = input.poNumberExtracted;
    if (input.poDate !== undefined) patch.poDate = input.poDate;
    if (input.deliveryDate !== undefined) patch.deliveryDate = input.deliveryDate;

    const [updated] = await this.db
      .update(poDrafts)
      .set(patch)
      .where(and(eq(poDrafts.id, draft.id), eq(poDrafts.tenantId, this.tenantId)))
      .returning();

    // After a customer change, refresh review flags so 'no_customer' clears
    // (or returns) without forcing a full re-parse.
    if (input.customerId !== undefined) {
      await this.refreshReviewFlags(draft.id);
    }

    return updated!;
  }

  /**
   * Update one line item. Handles three different change shapes:
   *   1. matchedItemId set/changed → re-resolve rate via PriceResolverService,
   *      record the alias for next time, recompute amount.
   *   2. quantity changed → re-resolve rate (qty tiers may differ), recompute amount.
   *   3. rate manually overridden → store as resolved_rate, recompute amount.
   * After any change the draft totals are recomputed and review flags refreshed.
   */
  async updateLine(
    uploadId: string,
    lineId: string,
    input: {
      matchedItemId?: string | null;
      quantity?: number | null;
      rate?: number | null;
      recordAlias?: boolean;
    },
  ): Promise<PoDraftLineRow> {
    const { draft } = await this.loadDraftByUploadId(uploadId);
    if (draft.reviewStatus === 'approved' || draft.reviewStatus === 'rejected') {
      throw new ConflictError(`Draft is ${draft.reviewStatus} and cannot be edited`);
    }

    const [line] = await this.db
      .select()
      .from(poDraftLines)
      .where(
        and(
          eq(poDraftLines.id, lineId),
          eq(poDraftLines.poDraftId, draft.id),
          eq(poDraftLines.tenantId, this.tenantId),
        ),
      )
      .limit(1);

    if (!line) throw new NotFoundError('PoDraftLine');

    const newItemId =
      input.matchedItemId === undefined ? line.matchedItemId : input.matchedItemId;
    const newQty =
      input.quantity !== undefined && input.quantity !== null
        ? input.quantity
        : line.rawQty != null
          ? Number(line.rawQty)
          : 0;
    const itemChanged = input.matchedItemId !== undefined && input.matchedItemId !== line.matchedItemId;

    let resolvedRate: number | null = null;
    let resolvedUom: string | null = line.resolvedUom;

    // Manual rate override always wins
    if (input.rate !== undefined && input.rate !== null) {
      resolvedRate = input.rate;
    } else if (newItemId && draft.customerId) {
      // Re-resolve via the price resolver
      try {
        const priceResolver = new PriceResolverService(this.db, this.tenantId);
        const price = await priceResolver.resolve({
          customerId: draft.customerId,
          itemId: newItemId,
          quantity: newQty || 1,
        });
        resolvedRate = price.effectiveRate;
      } catch {
        resolvedRate = line.resolvedRate != null ? Number(line.resolvedRate) : null;
      }
    } else {
      // No item or no customer — keep existing rate (or null if item was cleared)
      resolvedRate = newItemId ? (line.resolvedRate != null ? Number(line.resolvedRate) : null) : null;
    }

    // Pull UOM + alias text from the items master if the item changed
    let aliasItemId: string | null = null;
    if (itemChanged && newItemId) {
      const [it] = await this.db
        .select({ unit: items.unit })
        .from(items)
        .where(and(eq(items.id, newItemId), eq(items.tenantId, this.tenantId)))
        .limit(1);
      if (!it) throw new NotFoundError('Item');
      resolvedUom = it.unit ?? line.resolvedUom;
      aliasItemId = newItemId;
    }

    const amount =
      newItemId && resolvedRate != null && newQty > 0
        ? Number((newQty * resolvedRate).toFixed(2))
        : null;

    const matchSource: PoDraftLineRow['matchSource'] = itemChanged
      ? 'manual'
      : line.matchSource;

    const [updated] = await this.db
      .update(poDraftLines)
      .set({
        matchedItemId: newItemId,
        matchSource,
        matchConfidence: itemChanged ? '1.00' : line.matchConfidence,
        rawQty: input.quantity !== undefined ? (input.quantity != null ? String(input.quantity) : null) : line.rawQty,
        resolvedRate: resolvedRate != null ? String(resolvedRate) : null,
        resolvedUom,
        amount: amount != null ? String(amount) : null,
        reviewFlag: newItemId ? null : 'unmatched',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(poDraftLines.id, lineId),
          eq(poDraftLines.poDraftId, draft.id),
          eq(poDraftLines.tenantId, this.tenantId),
        ),
      )
      .returning();

    // The moat: remember "this customer's word for that item" for next time.
    // Only record on a manual item pick — not when the user is just editing qty/rate.
    const shouldRecord = (input.recordAlias ?? true) && aliasItemId && draft.customerId;
    if (shouldRecord) {
      await this.recordCustomerSkuAlias({
        customerId: draft.customerId!,
        aliasText: line.rawDescription,
        itemId: aliasItemId!,
      });
    }

    await this.recomputeDraftTotals(draft.id);
    await this.refreshReviewFlags(draft.id);

    return updated!;
  }

  /**
   * Upserts a (customer, lowercased description) → item mapping. Bumps
   * use_count and last_used_at on conflict so we can later expose "most
   * frequently confirmed aliases" for analytics or surface stale ones.
   */
  private async recordCustomerSkuAlias(args: {
    customerId: string;
    aliasText: string;
    itemId: string;
  }): Promise<void> {
    const aliasText = args.aliasText.trim().toLowerCase();
    if (!aliasText) return;

    await this.db
      .insert(customerSkuAliases)
      .values({
        tenantId: this.tenantId,
        customerId: args.customerId,
        aliasText,
        itemId: args.itemId,
        useCount: 1,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [customerSkuAliases.tenantId, customerSkuAliases.customerId, customerSkuAliases.aliasText],
        set: {
          itemId: args.itemId,
          useCount: sql`${customerSkuAliases.useCount} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Walk all lines, sum the resolved amounts, write back to po_drafts.
   * Tax is intentionally NOT computed here — InvoiceService.create runs the
   * full GST calculation at approve time using the buyer/seller place of
   * supply, so anything we computed here would just be discarded.
   */
  private async recomputeDraftTotals(draftId: string): Promise<void> {
    const [agg] = await this.db
      .select({
        subtotal: sql<string>`coalesce(sum(${poDraftLines.amount}), 0)::text`,
      })
      .from(poDraftLines)
      .where(and(eq(poDraftLines.poDraftId, draftId), eq(poDraftLines.tenantId, this.tenantId)));

    const subtotal = Number(agg?.subtotal ?? 0);
    await this.db
      .update(poDrafts)
      .set({
        subtotal: subtotal > 0 ? String(subtotal.toFixed(2)) : null,
        grandTotal: subtotal > 0 ? String(subtotal.toFixed(2)) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(poDrafts.id, draftId), eq(poDrafts.tenantId, this.tenantId)));
  }

  /**
   * Recompute review_flags + review_status from the current draft + lines
   * state. Called after any edit so the inbox badges stay accurate without
   * a full re-parse.
   */
  private async refreshReviewFlags(draftId: string): Promise<void> {
    const [draft] = await this.db
      .select()
      .from(poDrafts)
      .where(and(eq(poDrafts.id, draftId), eq(poDrafts.tenantId, this.tenantId)))
      .limit(1);
    if (!draft) return;

    const lines = await this.db
      .select({
        lineIndex: poDraftLines.lineIndex,
        matchedItemId: poDraftLines.matchedItemId,
      })
      .from(poDraftLines)
      .where(and(eq(poDraftLines.poDraftId, draftId), eq(poDraftLines.tenantId, this.tenantId)));

    const flags: Array<{ type: string; lineIndex?: number }> = [];
    if (!draft.customerId) flags.push({ type: 'no_customer' });
    for (const l of lines) {
      if (!l.matchedItemId) flags.push({ type: 'unmatched_sku', lineIndex: l.lineIndex });
    }

    // Preserve any 'low_confidence' flag from the original parse
    const existingFlags = Array.isArray(draft.reviewFlags) ? draft.reviewFlags : [];
    for (const f of existingFlags as Array<{ type: string }>) {
      if (f && f.type === 'low_confidence') flags.push(f as { type: string });
    }

    const reviewStatus = flags.length === 0 ? 'ready' : 'needs_review';

    // Don't downgrade an already-approved/rejected draft (defensive — those
    // states are blocked by the mutation guards above, but be explicit)
    if (draft.reviewStatus === 'approved' || draft.reviewStatus === 'rejected') return;

    await this.db
      .update(poDrafts)
      .set({
        reviewFlags: flags as unknown as object,
        reviewStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(poDrafts.id, draftId), eq(poDrafts.tenantId, this.tenantId)));
  }

  // ─── Approve / reject ──────────────────────────────────────────────────

  /**
   * Convert the draft to a real (status='draft') sales_invoices row via
   * InvoiceService.create. Validates that the draft is approvable first;
   * fails with ConflictError if any line is unmatched or any required field
   * is missing. Returns { invoiceId } so the caller can navigate.
   */
  async approve(uploadId: string, userId: string): Promise<{ invoiceId: string; invoiceNumber: string }> {
    const { draft } = await this.loadDraftByUploadId(uploadId);

    if (draft.reviewStatus === 'approved') {
      throw new ConflictError('Draft is already approved');
    }
    if (draft.reviewStatus === 'rejected') {
      throw new ConflictError('Cannot approve a rejected draft');
    }
    if (!draft.customerId) {
      throw new ConflictError('Pick a customer before approving');
    }

    // Pull lines + matched item details in one shot so we can build the
    // invoice line item shape with description (items.name), HSN, GST,
    // and UOM (items.unit).
    const lineRows = await this.db
      .select({
        line: poDraftLines,
        itemName: items.name,
        itemHsn: items.hsnSacCode,
        itemGstRate: items.gstRate,
        itemUnit: items.unit,
      })
      .from(poDraftLines)
      .innerJoin(items, eq(items.id, poDraftLines.matchedItemId))
      .where(and(eq(poDraftLines.poDraftId, draft.id), eq(poDraftLines.tenantId, this.tenantId)))
      .orderBy(poDraftLines.lineIndex);

    // Ensure NO unmatched lines (innerJoin already filtered them out, so a
    // count mismatch means unmatched lines exist).
    const totalLines = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(poDraftLines)
      .where(and(eq(poDraftLines.poDraftId, draft.id), eq(poDraftLines.tenantId, this.tenantId)));
    const totalCount = totalLines[0]?.count ?? 0;
    if (lineRows.length !== totalCount) {
      throw new ConflictError('All line items must be matched to an SKU before approving');
    }
    if (lineRows.length === 0) {
      throw new ConflictError('Draft has no line items');
    }

    // Build the invoice line items
    const invoiceItems = lineRows.map((r) => {
      const qty = r.line.rawQty != null ? Number(r.line.rawQty) : 0;
      const unitPrice = r.line.resolvedRate != null ? Number(r.line.resolvedRate) : 0;
      if (qty <= 0) {
        throw new ConflictError(`Line ${r.line.lineIndex + 1}: quantity must be > 0`);
      }
      if (unitPrice <= 0) {
        throw new ConflictError(`Line ${r.line.lineIndex + 1}: rate must be > 0`);
      }
      const amount = Number((qty * unitPrice).toFixed(2));
      // Prefer the items master unit; fall back to whatever the parser
      // captured from the PO (resolvedUom = items.unit when matched, or
      // rawUom from the LLM extraction).
      const uom = r.itemUnit ?? r.line.resolvedUom ?? r.line.rawUom ?? null;
      return {
        // Persist the link back to the items master so the invoice's edit
        // form can restore the picker and reports can group by SKU.
        itemId: r.line.matchedItemId,
        description: r.itemName,
        uom,
        quantity: qty,
        unitPrice,
        amount,
        hsnSacCode: r.itemHsn ?? null,
        taxCategory: 'taxable' as const,
        taxRate: r.itemGstRate != null ? Number(r.itemGstRate) : 0,
      };
    });

    const subtotal = Number(invoiceItems.reduce((s, it) => s + it.amount, 0).toFixed(2));

    // Pull the customer's payment terms to compute due date
    const [customer] = await this.db
      .select({ paymentTermsDays: customers.paymentTermsDays })
      .from(customers)
      .where(and(eq(customers.id, draft.customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer');

    const today = new Date().toISOString().slice(0, 10);
    const invoiceDate = draft.poDate ?? today;
    const dueDate = addDays(invoiceDate, customer.paymentTermsDays);

    // Tax is computed inside InvoiceService — pass the raw subtotal here and
    // let create() recompute. We pass totalAmount = subtotal as a placeholder;
    // create() doesn't trust it (it builds its own gst.summary).
    const input: CreateSalesInvoiceInput = {
      customerId: draft.customerId,
      invoiceDate,
      dueDate,
      items: invoiceItems,
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      notes: null,
      poNumber: draft.poNumberExtracted ?? null,
      reverseCharge: false,
    };

    const invoiceService = new InvoiceService(this.db, this.tenantId);
    const invoice = await invoiceService.create(input, userId);

    // Mark the draft as approved + linked to the new invoice
    await this.db
      .update(poDrafts)
      .set({
        reviewStatus: 'approved',
        approvedInvoiceId: invoice.id,
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(poDrafts.id, draft.id), eq(poDrafts.tenantId, this.tenantId)));

    return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
  }

  /**
   * Approve N drafts in one shot. Fail-soft per item: if one draft can't be
   * approved (missing customer, unmatched line, etc.), we record it in the
   * `failed` array and continue. The caller surfaces both counts in a toast.
   *
   * GL posting and webhook delivery for each created invoice are intentionally
   * NOT done here — the route handler walks the `created` array and dispatches
   * those side-effects, mirroring the single-approve path.
   */
  async bulkApprove(
    uploadIds: string[],
    userId: string,
  ): Promise<{
    created: Array<{ uploadId: string; invoiceId: string; invoiceNumber: string }>;
    failed: Array<{ uploadId: string; reason: string }>;
  }> {
    const created: Array<{ uploadId: string; invoiceId: string; invoiceNumber: string }> = [];
    const failed: Array<{ uploadId: string; reason: string }> = [];

    for (const uploadId of uploadIds) {
      try {
        const result = await this.approve(uploadId, userId);
        created.push({
          uploadId,
          invoiceId: result.invoiceId,
          invoiceNumber: result.invoiceNumber,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        failed.push({ uploadId, reason });
      }
    }

    return { created, failed };
  }

  /**
   * Mark a draft as rejected. The po_uploads row is preserved (and the
   * source file in storage), so a rejection is reversible by reparse if
   * the user changes their mind — for now, no API for that, but the data
   * is intact.
   */
  async reject(uploadId: string, userId: string, reason: string): Promise<PoDraftRow> {
    const { draft } = await this.loadDraftByUploadId(uploadId);

    if (draft.reviewStatus === 'approved') {
      throw new ConflictError('Cannot reject an already-approved draft');
    }
    if (draft.reviewStatus === 'rejected') {
      throw new ConflictError('Draft is already rejected');
    }

    const [updated] = await this.db
      .update(poDrafts)
      .set({
        reviewStatus: 'rejected',
        rejectedReason: reason,
        rejectedAt: new Date(),
        rejectedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(poDrafts.id, draft.id), eq(poDrafts.tenantId, this.tenantId)))
      .returning();

    return updated!;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

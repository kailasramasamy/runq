import { eq, and, sql, gte, lte, desc, isNull, ilike, inArray } from 'drizzle-orm';
import { purchaseInvoices, purchaseInvoiceItems, vendors, tenants, payments, paymentAllocations, bankAccounts, accounts } from '@runq/db';
import { GLService } from '../gl/gl.service';
import type { Db } from '@runq/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PurchaseInvoice, PurchaseInvoiceItem, PurchaseInvoiceWithDetails, PaginationMeta, TaxCategory, TaxBreakdown } from '@runq/types';
import type { CreatePurchaseInvoiceInput, UpdatePurchaseInvoiceInput, PurchaseInvoiceFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';
import { AttachmentService } from '../common/attachment.service';
import type { StorageProvider } from '../../utils/storage';
import { determinePlaceOfSupply, calculateLineItemTax, calculateInvoiceTax, resolveStateCode } from '../../utils/gst-calculator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = NodePgDatabase<any> | PgTransaction<any, any, any>;

export interface BillsSummary {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  pendingApprovalCount: number;
  paidThisMonth: number;
}

export interface InvoiceListParams {
  page: number;
  limit: number;
  filters: PurchaseInvoiceFilter;
}

export interface InvoiceListResult {
  data: (PurchaseInvoice & { vendorName: string; vendorCategory: string | null; vendorTags: string[] })[];
  meta: PaginationMeta;
}

export class PurchaseInvoiceService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  private audit(): AuditService {
    return new AuditService(this.db, this.tenantId);
  }

  async list(params: InvoiceListParams): Promise<InvoiceListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = this.buildWhereClause(filters);
    const categoryWhere = filters.vendorCategory ? eq(vendors.category, filters.vendorCategory) : undefined;
    const tagWhere = filters.vendorTag
      ? sql`${vendors.tags} @> ${JSON.stringify([filters.vendorTag])}::jsonb`
      : undefined;
    const fullWhere = and(baseWhere, categoryWhere, tagWhere);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          invoice: purchaseInvoices,
          vendorName: vendors.name,
          vendorCategory: vendors.category,
          vendorTags: vendors.tags,
        })
        .from(purchaseInvoices)
        .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
        .where(fullWhere)
        .orderBy(desc(purchaseInvoices.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(purchaseInvoices)
        .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
        .where(fullWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({
      ...this.toInvoice(r.invoice),
      vendorName: r.vendorName,
      vendorCategory: r.vendorCategory ?? null,
      vendorTags: Array.isArray(r.vendorTags) ? (r.vendorTags as string[]) : [],
    }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getForPrint(id: string) {
    const [row] = await this.db
      .select({ invoice: purchaseInvoices, vendor: vendors, tenant: tenants })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .innerJoin(tenants, eq(purchaseInvoices.tenantId, tenants.id))
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('PurchaseInvoice');
    const itemRows = await this.db
      .select()
      .from(purchaseInvoiceItems)
      .where(and(eq(purchaseInvoiceItems.invoiceId, id), eq(purchaseInvoiceItems.tenantId, this.tenantId)));
    return {
      bill: this.toInvoice(row.invoice),
      items: itemRows.map(this.toInvoiceItem),
      vendor: row.vendor,
      tenant: row.tenant,
    };
  }

  async getById(id: string): Promise<PurchaseInvoiceWithDetails> {
    const [row] = await this.db
      .select({ invoice: purchaseInvoices, vendorName: vendors.name })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('PurchaseInvoice');

    const itemRows = await this.db
      .select()
      .from(purchaseInvoiceItems)
      .where(and(eq(purchaseInvoiceItems.invoiceId, id), eq(purchaseInvoiceItems.tenantId, this.tenantId)));

    return {
      ...this.toInvoice(row.invoice),
      vendorName: row.vendorName,
      items: itemRows.map(this.toInvoiceItem),
    };
  }

  async create(input: CreatePurchaseInvoiceInput, userId?: string): Promise<PurchaseInvoiceWithDetails> {
    return this.db.transaction(async (tx) => {
      const gst = await this.computeGstForBill(tx, input.vendorId, input.items, input.reverseCharge);
      const tdsTotal = this.computeTdsTotal(input.items);

      // Honor the caller's subtotal/totalAmount — they reflect what the
      // user confirmed against the printed bill (freight, round-off, and
      // other non-GST charges live in the gap between subtotal and total).
      // But taxAmount MUST equal the sum of per-line GST or the header
      // diverges from the cgst/sgst/igst/cess columns we derive from
      // `gst`, breaking ITC aggregation and GSTR-3B Table 4. The AI
      // extractor in particular nulls taxAmount to 0 on rounding
      // mismatches while line items still carry tax — trusting it there
      // silently under-claimed ITC. So tax is always line-derived.
      const subtotal = input.subtotal ?? gst.summary.subtotal;
      const taxAmount = gst.summary.taxAmount;
      const totalAmount = input.totalAmount;

      const [invoice] = await tx
        .insert(purchaseInvoices)
        .values({
          tenantId: this.tenantId,
          vendorId: input.vendorId,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          poId: input.poId ?? null,
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          totalAmount: String(totalAmount),
          balanceDue: String(totalAmount),
          status: 'draft',
          placeOfSupply: gst.placeOfSupply?.placeOfSupply ?? null,
          placeOfSupplyCode: gst.placeOfSupply?.placeOfSupplyCode ?? null,
          isInterState: gst.placeOfSupply?.isInterState ?? null,
          cgstAmount: String(gst.summary.cgstAmount),
          sgstAmount: String(gst.summary.sgstAmount),
          igstAmount: String(gst.summary.igstAmount),
          cessAmount: String(gst.summary.cessAmount),
          reverseCharge: input.reverseCharge ?? false,
          tdsSection: input.tdsSection ?? null,
          tdsAmount: String(tdsTotal),
        })
        .returning();

      const items = await tx
        .insert(purchaseInvoiceItems)
        .values(
          input.items.map((item, i) => {
            const tax = gst.itemTaxes[i]!;
            const itemTds = (item.tdsRate ?? 0) * item.amount / 100;
            return {
              tenantId: this.tenantId,
              invoiceId: invoice!.id,
              itemName: item.itemName,
              sku: item.sku ?? null,
              quantity: String(item.quantity),
              unitPrice: String(item.unitPrice),
              amount: String(item.amount),
              hsnSacCode: item.hsnSacCode ?? null,
              taxCategory: (item.taxCategory as TaxCategory) ?? null,
              taxRate: item.taxRate != null ? String(item.taxRate) : null,
              cgstRate: String(tax.cgstRate),
              cgstAmount: String(tax.cgstAmount),
              sgstRate: String(tax.sgstRate),
              sgstAmount: String(tax.sgstAmount),
              igstRate: String(tax.igstRate),
              igstAmount: String(tax.igstAmount),
              cessRate: String(tax.cessRate),
              cessAmount: String(tax.cessAmount),
              tdsSection: item.tdsSection ?? null,
              tdsRate: item.tdsRate != null ? String(item.tdsRate) : null,
              tdsAmount: String(Math.round(itemTds * 100) / 100),
            };
          }),
        )
        .returning();

      const [vendorRow] = await tx
        .select({ name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, input.vendorId))
        .limit(1);

      const result = {
        ...this.toInvoice(invoice!),
        vendorName: vendorRow?.name ?? '',
        items: items.map(this.toInvoiceItem),
      };
      await this.audit().log({ userId, action: 'created', entityType: 'purchase_invoice', entityId: invoice!.id });
      return result;
    });
  }

  /**
   * Sum of vendor advances (payments without any allocation) — i.e., money
   * paid to the vendor before any bill exists, sitting in 1104 Advance to
   * Suppliers. Used by the bill create form to surface "apply advance" UX.
   */
  async getOpenAdvanceBalance(vendorId: string): Promise<number> {
    const [row] = await this.db
      .select({
        amount: sql<string>`COALESCE(SUM(${payments.amount}::numeric - COALESCE((
          SELECT SUM(pa.amount::numeric) FROM payment_allocations pa WHERE pa.payment_id = payments.id
        ), 0)), 0)::text`,
      })
      .from(payments)
      .where(and(
        eq(payments.tenantId, this.tenantId),
        eq(payments.vendorId, vendorId),
        eq(payments.status, 'completed'),
      ));
    return parseFloat(row?.amount ?? '0');
  }

  /**
   * Apply open vendor advances to a freshly-created bill (FIFO by payment_date).
   * Posts:
   *   - Per advance: a payment_allocation linking advance → bill.
   *   - One JE per applied total: DR 2101 AP / CR 1104 Advance to Suppliers.
   *   - Updates bill amount_paid / balance_due / status.
   * Returns the total applied. Idempotent: only applies up to bill balance.
   */
  async applyAdvancesToBill(billId: string): Promise<number> {
    const [bill] = await this.db.select().from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, billId), eq(purchaseInvoices.tenantId, this.tenantId))).limit(1);
    if (!bill) return 0;
    const billBalance = parseFloat(bill.balanceDue);
    if (billBalance <= 0.01) return 0;

    const [vendor] = await this.db.select({ name: vendors.name }).from(vendors)
      .where(eq(vendors.id, bill.vendorId)).limit(1);
    if (!vendor) return 0;

    const openAdvances = await this.db
      .select({
        id: payments.id,
        amount: payments.amount,
        date: payments.paymentDate,
        allocated: sql<string>`COALESCE((SELECT SUM(pa.amount::numeric) FROM payment_allocations pa WHERE pa.payment_id = payments.id), 0)::text`,
      })
      .from(payments)
      .where(and(
        eq(payments.tenantId, this.tenantId),
        eq(payments.vendorId, bill.vendorId),
        eq(payments.status, 'completed'),
      ))
      .orderBy(payments.paymentDate);

    let remaining = billBalance;
    let totalApplied = 0;
    await this.db.transaction(async (tx) => {
      for (const adv of openAdvances) {
        if (remaining <= 0.01) break;
        const advBalance = parseFloat(adv.amount) - parseFloat(adv.allocated);
        if (advBalance <= 0.01) continue;
        const applyAmount = Math.round(Math.min(advBalance, remaining) * 100) / 100;

        await tx.insert(paymentAllocations).values({
          tenantId: this.tenantId,
          paymentId: adv.id,
          invoiceId: billId,
          amount: String(applyAmount),
        });
        totalApplied = Math.round((totalApplied + applyAmount) * 100) / 100;
        remaining = Math.round((remaining - applyAmount) * 100) / 100;
      }

      if (totalApplied > 0) {
        const newPaid = parseFloat(bill.amountPaid) + totalApplied;
        const newBal = parseFloat(bill.totalAmount) - newPaid;
        await tx.update(purchaseInvoices).set({
          amountPaid: String(Math.round(newPaid * 100) / 100),
          balanceDue: String(Math.max(0, Math.round(newBal * 100) / 100)),
          status: newBal <= 0.01 ? 'paid' : 'partially_paid',
          updatedAt: new Date(),
        }).where(eq(purchaseInvoices.id, billId));
      }
    });

    if (totalApplied > 0) {
      const gl = new GLService(this.db, this.tenantId);
      await gl.postAdvanceApplication({
        amount: totalApplied,
        date: bill.invoiceDate,
        billId,
        vendorName: vendor.name,
      });
    }

    void isNull;
    return totalApplied;
  }

  /**
   * Record an owner-paid payment against a bill — money the owner spent
   * personally (e.g. via personal GPay) on behalf of the company. Books it
   * as a Petty Cash payment with a paired owner-injection JE so the cash
   * trail stays balanced:
   *   1. Owner injection JE: Dr 1102 Petty Cash / Cr 3005 Owner's Capital
   *   2. Payment + allocation against the bill (status=completed, source=Petty Cash)
   *   3. Payment JE: Dr 2101 AP / Cr 1102 Petty Cash
   * Net effect: Dr 2101 / Cr 3005 — the owner's personal funds settle the AP.
   * Auto-creates the Petty Cash bank_account row if missing.
   */
  async recordOwnerPayment(
    billId: string,
    input: { amount: number; paymentDate: string; notes?: string | null },
  ): Promise<{ paymentId: string }> {
    const [bill] = await this.db.select().from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, billId), eq(purchaseInvoices.tenantId, this.tenantId))).limit(1);
    if (!bill) throw new NotFoundError('PurchaseInvoice');

    const balanceDue = parseFloat(bill.balanceDue);
    if (input.amount <= 0) throw new ConflictError('Amount must be positive');
    if (input.amount > balanceDue + 0.01) {
      throw new ConflictError(`Amount ${input.amount} exceeds balance due ${balanceDue}`);
    }

    const [vendor] = await this.db.select({ name: vendors.name }).from(vendors)
      .where(eq(vendors.id, bill.vendorId)).limit(1);
    if (!vendor) throw new NotFoundError('Vendor');

    const [pettyCashGl] = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.code, '1102'))).limit(1);
    if (!pettyCashGl) throw new ConflictError('Petty Cash GL account (1102) not found');

    let [pettyCashBank] = await this.db.select({ id: bankAccounts.id }).from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.glAccountId, pettyCashGl.id))).limit(1);
    if (!pettyCashBank) {
      [pettyCashBank] = await this.db.select({ id: bankAccounts.id }).from(bankAccounts)
        .where(and(eq(bankAccounts.tenantId, this.tenantId), ilike(bankAccounts.name, 'Petty Cash%'))).limit(1);
    }
    if (!pettyCashBank) {
      const [created] = await this.db.insert(bankAccounts).values({
        tenantId: this.tenantId,
        name: 'Petty Cash',
        bankName: 'Cash',
        accountNumber: 'CASH',
        ifscCode: 'CASH0000000',
        accountType: 'current',
        glAccountId: pettyCashGl.id,
      }).returning({ id: bankAccounts.id });
      pettyCashBank = created!;
    }

    const paymentId = await this.db.transaction(async (tx) => {
      const [payment] = await tx.insert(payments).values({
        tenantId: this.tenantId,
        vendorId: bill.vendorId,
        bankAccountId: pettyCashBank!.id,
        paymentDate: input.paymentDate,
        amount: String(input.amount),
        paymentMethod: 'bank_transfer',
        status: 'completed',
        notes: input.notes ?? 'Owner-paid (personal funds via Petty Cash)',
      }).returning();

      await tx.insert(paymentAllocations).values({
        tenantId: this.tenantId,
        paymentId: payment!.id,
        invoiceId: billId,
        amount: String(input.amount),
      });

      const newPaid = parseFloat(bill.amountPaid) + input.amount;
      const newBal = parseFloat(bill.totalAmount) - newPaid;
      await tx.update(purchaseInvoices).set({
        amountPaid: String(Math.round(newPaid * 100) / 100),
        balanceDue: String(Math.max(0, Math.round(newBal * 100) / 100)),
        status: newBal <= 0.01 ? 'paid' : 'partially_paid',
        updatedAt: new Date(),
      }).where(eq(purchaseInvoices.id, billId));

      return payment!.id;
    });

    const gl = new GLService(this.db, this.tenantId);
    await gl.createJournalEntry({
      date: input.paymentDate,
      description: `Owner contribution — personal funds for ${vendor.name}`,
      sourceType: 'owner_injection',
      sourceId: paymentId,
      lines: [
        { accountCode: '1102', debit: input.amount },
        { accountCode: '3005', credit: input.amount },
      ],
    });
    await gl.postPayment({
      amount: input.amount,
      date: input.paymentDate,
      id: paymentId,
      vendorName: vendor.name,
      bankAccountCode: '1102',
    });

    return { paymentId };
  }

  private async computeGstForBill(
    tx: AnyTx,
    vendorId: string,
    items: CreatePurchaseInvoiceInput['items'],
    reverseCharge?: boolean,
  ) {
    const [tenantRow] = await tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    const settings = (tenantRow?.settings ?? {}) as { stateCode?: string };

    const [vendorRow] = await tx
      .select({ state: vendors.state, gstin: vendors.gstin })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    const buyerState = settings.stateCode ?? '';
    const sellerGstin = vendorRow?.gstin;
    const sellerState = sellerGstin ? sellerGstin.slice(0, 2) : resolveStateCode(vendorRow?.state ?? buyerState);

    const placeOfSupply = buyerState && sellerState ? determinePlaceOfSupply(sellerState, buyerState) : null;
    const isInterState = placeOfSupply?.isInterState ?? false;

    const itemTaxes: TaxBreakdown[] = items.map((item) => {
      const taxCategory: TaxCategory = reverseCharge ? 'reverse_charge' : (item.taxCategory as TaxCategory) ?? 'taxable';
      return calculateLineItemTax({
        amount: item.amount,
        taxRate: item.taxRate ?? 0,
        isInterState,
        taxCategory,
        cessRate: item.cessRate ?? 0,
      });
    });

    const summary = calculateInvoiceTax(items.map((item, i) => ({ amount: item.amount, tax: itemTaxes[i]! })));
    return { placeOfSupply, itemTaxes, summary };
  }

  private computeTdsTotal(items: CreatePurchaseInvoiceInput['items']): number {
    let total = 0;
    for (const item of items) {
      if (item.tdsRate) {
        total += item.amount * item.tdsRate / 100;
      }
    }
    return Math.round(total * 100) / 100;
  }

  async update(id: string, input: UpdatePurchaseInvoiceInput): Promise<PurchaseInvoiceWithDetails> {
    const existing = await this.getById(id);
    // Mirrors the sales-invoice amend policy: drafts edit freely; matched
    // / approved bills can still be amended when no payment has been
    // made yet (the "vendor revised the bill" workflow). Once any rupee
    // is paid, direct edits would break the matched allocation — fall
    // back to a debit-note adjustment instead.
    const amountPaid = Number(existing.amountPaid ?? 0);
    const isAmendable =
      existing.status === 'draft' ||
      ((existing.status === 'matched' || existing.status === 'approved') && amountPaid === 0);
    if (!isAmendable) {
      if (existing.status === 'cancelled') {
        throw new ConflictError('Cancelled bills cannot be edited');
      }
      if (amountPaid > 0) {
        throw new ConflictError(
          'Cannot edit a bill that has been paid. Issue a debit note instead.',
        );
      }
      throw new ConflictError(`Bill in status '${existing.status}' cannot be edited`);
    }
    const needsJeRebuild = existing.status !== 'draft';

    // If line items change, recompute GST so header tax columns stay in
    // lockstep with per-line cgst/sgst/igst/cess. Reuse vendor + RCM flag
    // from the existing bill when the caller didn't pass new ones.
    const itemsChanging = !!(input.items && input.items.length > 0);
    const gst = itemsChanging
      ? await this.computeGstForBill(
          this.db,
          input.vendorId ?? existing.vendorId,
          input.items!,
          input.reverseCharge ?? existing.reverseCharge,
        )
      : null;

    await this.db.transaction(async (tx) => {
      await tx
        .update(purchaseInvoices)
        .set({
          ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
          ...(input.invoiceNumber !== undefined && { invoiceNumber: input.invoiceNumber }),
          ...(input.invoiceDate !== undefined && { invoiceDate: input.invoiceDate }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
          ...(input.poId !== undefined && { poId: input.poId ?? null }),
          ...(input.subtotal !== undefined && { subtotal: String(input.subtotal) }),
          ...(input.totalAmount !== undefined && {
            totalAmount: String(input.totalAmount),
            balanceDue: String(input.totalAmount),
          }),
          ...(gst && {
            taxAmount: String(gst.summary.taxAmount),
            cgstAmount: String(gst.summary.cgstAmount),
            sgstAmount: String(gst.summary.sgstAmount),
            igstAmount: String(gst.summary.igstAmount),
            cessAmount: String(gst.summary.cessAmount),
            placeOfSupply: gst.placeOfSupply?.placeOfSupply ?? null,
            placeOfSupplyCode: gst.placeOfSupply?.placeOfSupplyCode ?? null,
            isInterState: gst.placeOfSupply?.isInterState ?? null,
          }),
          ...(input.reverseCharge !== undefined && { reverseCharge: input.reverseCharge }),
          updatedAt: new Date(),
        })
        .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)));

      if (itemsChanging) {
        await this.replaceLineItems(tx as unknown as Db, id, input.items!, gst!.itemTaxes);
      }

      // Amending an already-posted bill: unwind the existing JE and
      // re-post against the new totals inside the same tx so a partial
      // failure leaves no half-rebuilt entry.
      if (needsJeRebuild) {
        const gl = new GLService(tx as unknown as Db, this.tenantId);
        await gl.deletePostingsFor('purchase_invoice', id);
        const refreshed = await this.getById(id);
        await gl.postPurchaseInvoice({
          id,
          date: refreshed.invoiceDate,
          totalAmount: Number(refreshed.totalAmount),
          vendorName: refreshed.vendorName ?? 'Vendor',
        });
      }
    });

    return this.getById(id);
  }

  async cancel(id: string, userId?: string): Promise<PurchaseInvoice> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft' && existing.status !== 'pending_match') {
      throw new ConflictError('Only draft or pending match invoices can be cancelled');
    }

    const [row] = await this.db
      .update(purchaseInvoices)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)))
      .returning();

    await this.audit().log({ userId, action: 'cancelled', entityType: 'purchase_invoice', entityId: id });
    return this.toInvoice(row!);
  }

  /**
   * Hard delete a draft bill — removes line items, the bill row, and any
   * attached scanned originals (DB rows + S3 objects). Only valid for
   * `draft` status; bills with payments, GL entries, or in any other
   * status must be cancelled instead so the audit trail survives.
   *
   * Why this exists: cancel() leaves a `cancelled` row and an orphaned S3
   * file forever. For drafts created in error (bad scan, wrong vendor,
   * duplicate), the user wants a clean undo — not an audit trail.
   */
  async hardDelete(id: string, storage: StorageProvider, userId?: string): Promise<void> {
    const existing = await this.getById(id);
    // Same amend policy as update(): drafts go through unconditionally;
    // matched/approved bills can be deleted only when no payment has
    // been made. The posted JE is unwound in-line so the books stay
    // balanced (no rupee was paid against it, so nothing downstream
    // depends on it).
    const amountPaid = Number(existing.amountPaid ?? 0);
    const canDelete =
      existing.status === 'draft' ||
      ((existing.status === 'matched' || existing.status === 'approved') && amountPaid === 0);
    if (!canDelete) {
      if (amountPaid > 0) {
        throw new ConflictError(
          'Cannot delete a bill that has been paid. Issue a debit note instead.',
        );
      }
      throw new ConflictError(`Cannot delete a bill in status '${existing.status}'`);
    }

    // Wipe attachments first — best-effort on S3, hard on DB. If a single
    // S3 delete fails we still proceed: orphaned objects are cheap and
    // can be cleaned via lifecycle policy later.
    const attachmentService = new AttachmentService(this.db, this.tenantId, storage);
    const attachments = await attachmentService.listByEntity('purchase_invoice', id);
    for (const att of attachments) {
      try {
        await attachmentService.deleteAttachment(att.id);
      } catch {
        // Continue — best-effort cleanup.
      }
    }

    // Unwind any GL posting for this bill before we drop the row — the
    // JE references the bill via source_id and would dangle otherwise.
    // Idempotent: no-op if nothing was posted (draft path).
    const gl = new GLService(this.db, this.tenantId);
    await gl.deletePostingsFor('purchase_invoice', id);

    await this.db
      .delete(purchaseInvoiceItems)
      .where(and(eq(purchaseInvoiceItems.invoiceId, id), eq(purchaseInvoiceItems.tenantId, this.tenantId)));

    await this.db
      .delete(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)));

    await this.audit().log({
      userId,
      action: 'deleted',
      entityType: 'purchase_invoice',
      entityId: id,
      metadata: {
        invoiceNumber: existing.invoiceNumber,
        totalAmount: existing.totalAmount,
        attachmentsRemoved: attachments.length,
      },
    });
  }

  private async replaceLineItems(
    db: Db,
    invoiceId: string,
    items: NonNullable<UpdatePurchaseInvoiceInput['items']>,
    itemTaxes: TaxBreakdown[],
  ): Promise<void> {
    await db
      .delete(purchaseInvoiceItems)
      .where(and(eq(purchaseInvoiceItems.invoiceId, invoiceId), eq(purchaseInvoiceItems.tenantId, this.tenantId)));

    await db.insert(purchaseInvoiceItems).values(
      items.map((item, i) => {
        const tax = itemTaxes[i]!;
        const itemTds = (item.tdsRate ?? 0) * item.amount / 100;
        return {
          tenantId: this.tenantId,
          invoiceId,
          itemName: item.itemName!,
          sku: item.sku ?? null,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          amount: String(item.amount),
          hsnSacCode: item.hsnSacCode ?? null,
          taxCategory: (item.taxCategory as TaxCategory) ?? null,
          taxRate: item.taxRate != null ? String(item.taxRate) : null,
          cgstRate: String(tax.cgstRate),
          cgstAmount: String(tax.cgstAmount),
          sgstRate: String(tax.sgstRate),
          sgstAmount: String(tax.sgstAmount),
          igstRate: String(tax.igstRate),
          igstAmount: String(tax.igstAmount),
          cessRate: String(tax.cessRate),
          cessAmount: String(tax.cessAmount),
          tdsSection: item.tdsSection ?? null,
          tdsRate: item.tdsRate != null ? String(item.tdsRate) : null,
          tdsAmount: String(Math.round(itemTds * 100) / 100),
        };
      }),
    );
  }

  async summary(scope?: { vendorId?: string }): Promise<BillsSummary> {
    const today = new Date().toISOString().split('T')[0]!;
    const monthStart = today.slice(0, 7) + '-01';
    // Optional vendor scope — narrows every metric to one vendor so the
    // mobile bills screen can show per-vendor outstanding / overdue / etc.
    const vendorScope = scope?.vendorId
      ? eq(purchaseInvoices.vendorId, scope.vendorId)
      : undefined;

    const [outstanding, overdue, pendingApproval, paidThisMonth] = await Promise.all([
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
        .from(purchaseInvoices)
        .where(and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          vendorScope,
          sql`${purchaseInvoices.status} NOT IN ('paid', 'cancelled', 'draft')`,
        )),
      this.db
        .select({
          count: sql<number>`COUNT(*)::int`,
          amount: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text`,
        })
        .from(purchaseInvoices)
        .where(and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          vendorScope,
          sql`${purchaseInvoices.dueDate} < ${today}`,
          sql`${purchaseInvoices.status} NOT IN ('paid', 'cancelled')`,
          sql`${purchaseInvoices.balanceDue} > 0`,
        )),
      this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(purchaseInvoices)
        .where(and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          vendorScope,
          sql`${purchaseInvoices.status} IN ('draft', 'pending_match', 'matched')`,
        )),
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${purchaseInvoices.amountPaid}), 0)::text` })
        .from(purchaseInvoices)
        .where(and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          vendorScope,
          sql`${purchaseInvoices.status} IN ('paid', 'partially_paid')`,
          gte(purchaseInvoices.updatedAt, new Date(monthStart)),
        )),
    ]);

    return {
      totalOutstanding: Number(outstanding[0]?.total ?? 0),
      overdueCount: overdue[0]?.count ?? 0,
      overdueAmount: Number(overdue[0]?.amount ?? 0),
      pendingApprovalCount: pendingApproval[0]?.count ?? 0,
      paidThisMonth: Number(paidThisMonth[0]?.total ?? 0),
    };
  }

  private buildWhereClause(filters: PurchaseInvoiceFilter) {
    // Status filter accepts CSV ("draft,approved,partially_paid") so callers
    // can express groups like "all unpaid"; schema-level refine guarantees
    // each part is a valid enum value.
    const statusParts = filters.status
      ? filters.status.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    type Status = typeof purchaseInvoices.status.enumValues[number];
    return and(
      eq(purchaseInvoices.tenantId, this.tenantId),
      filters.vendorId ? eq(purchaseInvoices.vendorId, filters.vendorId) : undefined,
      statusParts.length === 1
        ? eq(purchaseInvoices.status, statusParts[0] as Status)
        : statusParts.length > 1
          ? inArray(purchaseInvoices.status, statusParts as Status[])
          : undefined,
      filters.search ? sql`(${purchaseInvoices.invoiceNumber} ILIKE ${'%' + filters.search + '%'} OR EXISTS (SELECT 1 FROM ${vendors} WHERE ${vendors.id} = ${purchaseInvoices.vendorId} AND ${vendors.name} ILIKE ${'%' + filters.search + '%'}))` : undefined,
      filters.overdue ? sql`${purchaseInvoices.dueDate} < CURRENT_DATE AND ${purchaseInvoices.balanceDue} > 0` : undefined,
      filters.dateFrom ? gte(purchaseInvoices.invoiceDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(purchaseInvoices.invoiceDate, filters.dateTo) : undefined,
    );
  }

  private toInvoice(row: typeof purchaseInvoices.$inferSelect): PurchaseInvoice {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceNumber: row.invoiceNumber,
      vendorId: row.vendorId,
      poId: row.poId ?? null,
      grnId: row.grnId ?? null,
      invoiceDate: row.invoiceDate,
      dueDate: row.dueDate,
      subtotal: Number(row.subtotal),
      taxAmount: Number(row.taxAmount),
      totalAmount: Number(row.totalAmount),
      amountPaid: Number(row.amountPaid),
      balanceDue: Number(row.balanceDue),
      status: row.status,
      matchStatus: row.matchStatus,
      matchNotes: row.matchNotes ?? null,
      approvedBy: row.approvedBy ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      wmsInvoiceId: row.wmsInvoiceId ?? null,
      placeOfSupply: row.placeOfSupply ?? null,
      placeOfSupplyCode: row.placeOfSupplyCode ?? null,
      isInterState: row.isInterState ?? null,
      cgstAmount: Number(row.cgstAmount),
      sgstAmount: Number(row.sgstAmount),
      igstAmount: Number(row.igstAmount),
      cessAmount: Number(row.cessAmount),
      reverseCharge: row.reverseCharge,
      tdsSection: row.tdsSection ?? null,
      tdsAmount: Number(row.tdsAmount),
      sourceId: row.sourceId ?? null,
      externalId: row.externalId ?? null,
      externalVersion: row.externalVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toInvoiceItem(row: typeof purchaseInvoiceItems.$inferSelect): PurchaseInvoiceItem {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      poItemId: row.poItemId ?? null,
      itemName: row.itemName,
      sku: row.sku ?? null,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unitPrice),
      amount: Number(row.amount),
      hsnSacCode: row.hsnSacCode ?? null,
      taxCategory: row.taxCategory as TaxCategory | null,
      taxRate: row.taxRate != null ? Number(row.taxRate) : null,
      cgstRate: Number(row.cgstRate),
      cgstAmount: Number(row.cgstAmount),
      sgstRate: Number(row.sgstRate),
      sgstAmount: Number(row.sgstAmount),
      igstRate: Number(row.igstRate),
      igstAmount: Number(row.igstAmount),
      cessRate: Number(row.cessRate),
      cessAmount: Number(row.cessAmount),
      tdsSection: row.tdsSection ?? null,
      tdsRate: row.tdsRate != null ? Number(row.tdsRate) : null,
      tdsAmount: Number(row.tdsAmount),
    };
  }
}

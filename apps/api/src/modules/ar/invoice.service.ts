import { eq, and, sql, gte, lte, inArray, notInArray, desc } from 'drizzle-orm';
import {
  salesInvoices, salesInvoiceItems, customers, invoiceSequences, tenants,
  paymentReceipts, receiptAllocations, bankAccounts, items,
  creditNotes, collectionAssignments, dunningLog, journalEntries, poDrafts,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { SalesInvoice, SalesInvoiceItem, SalesInvoiceStatus, SalesInvoiceWithDetails, PaginationMeta } from '@runq/types';
import type { CreateSalesInvoiceInput, UpdateSalesInvoiceInput, SalesInvoiceFilter, SendInvoiceInput, MarkPaidInput } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';
import { GLService } from '../gl/gl.service';
import { sendEmail } from '../../utils/email';
import { invoiceSent } from '../../utils/email-templates';
import { getTenantName } from '../../utils/tenant-name';
import { determinePlaceOfSupply, calculateLineItemTax, calculateInvoiceTax, resolveStateCode } from '../../utils/gst-calculator';
import { defaultPackSize } from '../gst/hsn-canonical-uqc';
import { getMessageProvider } from '../../utils/messaging';
import type { TaxCategory, TaxBreakdown } from '@runq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = NodePgDatabase<any> | PgTransaction<any, any, any>;

export interface InvoiceSummary {
  totalSales: number;
  totalReceived: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  draftCount: number;
  pendingCount: number;
}

export interface InvoiceListParams {
  page: number;
  limit: number;
  filters: SalesInvoiceFilter;
}

export interface InvoiceListResult {
  data: (SalesInvoice & {
    customerName: string;
    customerNickname: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
  })[];
  meta: PaginationMeta;
}

interface TenantSettings {
  invoicePrefix?: string;
  invoiceFormat?: string;
  invoiceStartSequence?: number;
  invoiceSequencePadding?: number;
  financialYearStartMonth?: number;
}

export class InvoiceService {
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

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          invoice: salesInvoices,
          customerName: customers.name,
          customerNickname: customers.nickname,
          customerEmail: customers.email,
          customerPhone: customers.phone,
        })
        .from(salesInvoices)
        .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
        .where(baseWhere)
        .orderBy(
          sql`CASE WHEN ${salesInvoices.invoiceNumber} LIKE 'OB-%' THEN 1 ELSE 0 END`,
          desc(salesInvoices.invoiceNumber),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(salesInvoices).innerJoin(customers, eq(salesInvoices.customerId, customers.id)).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({
      ...this.toInvoice(r.invoice),
      customerName: r.customerName,
      customerNickname: r.customerNickname ?? null,
      customerEmail: r.customerEmail ?? null,
      customerPhone: r.customerPhone ?? null,
    }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<SalesInvoiceWithDetails> {
    const [row] = await this.db
      .select({
        invoice: salesInvoices,
        customerName: customers.name,
        customerNickname: customers.nickname,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('SalesInvoice');

    const itemRows = await this.queryInvoiceItemsWithMaster(id);

    return {
      ...this.toInvoice(row.invoice),
      customerName: row.customerName,
      customerNickname: row.customerNickname ?? null,
      customerEmail: row.customerEmail ?? null,
      customerPhone: row.customerPhone ?? null,
      items: itemRows,
    };
  }

  /**
   * Loads invoice line items with the linked items-master name + sku via
   * LEFT JOIN. Centralised so getById, getForPrint, and any future caller
   * all return a consistent shape.
   */
  private async queryInvoiceItemsWithMaster(invoiceId: string): Promise<SalesInvoiceItem[]> {
    const rows = await this.db
      .select({ line: salesInvoiceItems, itemName: items.name, itemSku: items.sku })
      .from(salesInvoiceItems)
      .leftJoin(items, eq(items.id, salesInvoiceItems.itemId))
      .where(
        and(
          eq(salesInvoiceItems.invoiceId, invoiceId),
          eq(salesInvoiceItems.tenantId, this.tenantId),
        ),
      );
    return rows.map((r) => ({
      ...this.toInvoiceItem(r.line),
      itemName: r.itemName ?? null,
      itemSku: r.itemSku ?? null,
    }));
  }

  async getForPrint(id: string): Promise<{
    invoice: SalesInvoice;
    items: SalesInvoiceItem[];
    customer: typeof customers.$inferSelect;
    tenant: typeof tenants.$inferSelect;
    bankAccounts: Array<{
      name: string;
      bankName: string;
      accountNumber: string;
      ifscCode: string;
    }>;
  }> {
    const [row] = await this.db
      .select({ invoice: salesInvoices, customer: customers })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('SalesInvoice');

    const [tenantRow] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    const itemRows = await this.queryInvoiceItemsWithMaster(id);

    // Resolve which bank account to render. Priority:
    //   1. Customer's designated default_bank_account_id
    //   2. Tenant-level default (tenant.settings.defaultInvoiceBankAccountId)
    //   3. Nothing — better than auto-leaking ALL bank accounts to the buyer
    //
    // We deliberately do NOT fall back to "first active bank account" — that
    // would expose accounts the seller didn't intend to share (e.g. petty
    // cash, internal sweep accounts).
    const tenantSettings = (tenantRow?.settings ?? {}) as Record<string, unknown>;
    const settingsDefault = typeof tenantSettings.defaultInvoiceBankAccountId === 'string'
      ? (tenantSettings.defaultInvoiceBankAccountId as string)
      : null;
    const chosenBankId = row.customer.defaultBankAccountId ?? settingsDefault;

    let bankRows: Array<{
      name: string;
      bankName: string;
      accountNumber: string;
      ifscCode: string;
    }> = [];
    if (chosenBankId) {
      bankRows = await this.db
        .select({
          name: bankAccounts.name,
          bankName: bankAccounts.bankName,
          accountNumber: bankAccounts.accountNumber,
          ifscCode: bankAccounts.ifscCode,
        })
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.tenantId, this.tenantId),
            eq(bankAccounts.id, chosenBankId),
            eq(bankAccounts.isActive, true),
          ),
        )
        .limit(1);
    }

    return {
      invoice: this.toInvoice(row.invoice),
      items: itemRows,
      customer: row.customer,
      tenant: tenantRow!,
      bankAccounts: bankRows,
    };
  }

  private async checkCreditLimit(customerId: string, newInvoiceTotal: number): Promise<void> {
    const [customer] = await this.db
      .select({ creditLimit: customers.creditLimit })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);

    if (!customer?.creditLimit) return;

    const limit = Number(customer.creditLimit);
    const [outstandingRow] = await this.db
      .select({ total: sql<number>`coalesce(sum(${salesInvoices.balanceDue}), 0)::float` })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          eq(salesInvoices.customerId, customerId),
          notInArray(salesInvoices.status, ['paid', 'cancelled']),
          sql`${salesInvoices.balanceDue} > 0`,
        ),
      );

    const outstanding = outstandingRow?.total ?? 0;
    if (outstanding + newInvoiceTotal > limit) {
      throw new ConflictError(
        `Customer credit limit exceeded (limit: ₹${limit.toFixed(2)}, outstanding: ₹${outstanding.toFixed(2)}, new invoice: ₹${newInvoiceTotal.toFixed(2)})`,
      );
    }
  }

  async create(
    input: CreateSalesInvoiceInput,
    userId?: string,
    options?: {
      /**
       * Use this exact invoice number instead of generating one from the FY
       * sequence. Used by the invoice import flow to preserve source numbers
       * (e.g. 260003) verbatim. Caller is responsible for ensuring the
       * (tenant_id, invoice_number) pair is unique — the unique constraint
       * will throw on duplicates.
       */
      explicitInvoiceNumber?: string;
      /**
       * Skip the credit-limit check. Set when importing historical invoices
       * that are already part of the customer's outstanding balance — the
       * balance check would otherwise reject every line.
       */
      skipCreditCheck?: boolean;
    },
  ): Promise<SalesInvoiceWithDetails> {
    return this.db.transaction(async (tx) => {
      if (!options?.skipCreditCheck) {
        await this.checkCreditLimit(input.customerId, input.totalAmount);
      }
      const invoiceNumber =
        options?.explicitInvoiceNumber ?? (await this.resolveInvoiceNumber(tx));
      const gst = await this.computeGstForInvoice(tx, input.customerId, input.items, input.reverseCharge);

      // Honor the totals the caller passed in. The PO-approval flow finalises
      // subtotal / taxAmount / totalAmount on the review screen against the
      // printed PO (which often has GST baked into the rate), so re-deriving
      // here would double-count tax and break PO ↔ invoice reconciliation.
      // Per-line cgst/sgst/igst columns still come from `gst` so reports work.
      const subtotal = input.subtotal ?? gst.summary.subtotal;
      const taxAmount = input.taxAmount ?? gst.summary.taxAmount;
      const totalAmount = input.totalAmount;

      const [invoice] = await tx
        .insert(salesInvoices)
        .values({
          tenantId: this.tenantId,
          invoiceNumber,
          customerId: input.customerId,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          totalAmount: String(totalAmount),
          balanceDue: String(totalAmount),
          status: 'draft',
          notes: input.notes ?? null,
          poNumber: input.poNumber ?? null,
          placeOfSupply: gst.placeOfSupply?.placeOfSupply ?? null,
          placeOfSupplyCode: gst.placeOfSupply?.placeOfSupplyCode ?? null,
          isInterState: gst.placeOfSupply?.isInterState ?? null,
          cgstAmount: String(gst.summary.cgstAmount),
          sgstAmount: String(gst.summary.sgstAmount),
          igstAmount: String(gst.summary.igstAmount),
          cessAmount: String(gst.summary.cessAmount),
          reverseCharge: input.reverseCharge ?? false,
        })
        .returning();

      const items = await tx
        .insert(salesInvoiceItems)
        .values(
          input.items.map((item, i) => {
            const tax = gst.itemTaxes[i]!;
            return {
              tenantId: this.tenantId,
              invoiceId: invoice!.id,
              itemId: item.itemId ?? null,
              description: item.description,
              uom: item.uom ?? null,
              ...(item.itemId ? {} : (() => {
                const def = defaultPackSize(item.hsnSacCode, item.uom);
                return { packSizeValue: String(def.packSizeValue), packSizeUqc: def.packSizeUqc };
              })()),
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
            };
          }),
        )
        .returning();

      const [customerRow] = await tx
        .select({ name: customers.name, nickname: customers.nickname, email: customers.email, phone: customers.phone })
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .limit(1);

      const result = {
        ...this.toInvoice(invoice!),
        customerName: customerRow?.name ?? '',
        customerNickname: customerRow?.nickname ?? null,
        customerEmail: customerRow?.email ?? null,
        customerPhone: customerRow?.phone ?? null,
        items: items.map(this.toInvoiceItem),
      };
      await this.audit().log({ userId, action: 'created', entityType: 'sales_invoice', entityId: invoice!.id });
      return result;
    });
  }

  private async computeGstForInvoice(
    tx: AnyTx,
    customerId: string,
    items: CreateSalesInvoiceInput['items'],
    reverseCharge?: boolean,
  ) {
    const [tenantRow] = await tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    const settings = (tenantRow?.settings ?? {}) as TenantSettings & { stateCode?: string };

    const [customerRow] = await tx
      .select({ state: customers.state, gstin: customers.gstin })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    const sellerState = settings.stateCode ?? '';
    const buyerGstin = customerRow?.gstin;
    const buyerState = buyerGstin ? buyerGstin.slice(0, 2) : resolveStateCode(customerRow?.state ?? sellerState);

    const placeOfSupply = sellerState && buyerState ? determinePlaceOfSupply(sellerState, buyerState) : null;
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

  private async resolveInvoiceNumber(tx: AnyTx): Promise<string> {
    const [tenantRow] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    const settings = (tenantRow?.settings ?? {}) as TenantSettings;
    const fy = this.getCurrentFY(settings.financialYearStartMonth ?? 4);

    // First invoice in a new FY uses the tenant-configured start sequence
    // (defaulting to 1). On conflict the existing counter just increments.
    const startSeq = settings.invoiceStartSequence ?? 1;
    const [seqRow] = await tx
      .insert(invoiceSequences)
      .values({ tenantId: this.tenantId, financialYear: fy, lastSequence: startSeq })
      .onConflictDoUpdate({
        target: [invoiceSequences.tenantId, invoiceSequences.financialYear],
        set: { lastSequence: sql`${invoiceSequences.lastSequence} + 1`, updatedAt: new Date() },
      })
      .returning();

    return this.formatInvoiceNumber(settings, fy, seqRow!.lastSequence);
  }

  /**
   * Extract the highest sequence number from a list of invoice numbers
   * by reverse-engineering the tenant's format template.
   */
  async extractMaxSequence(invoiceNumbers: string[]): Promise<number> {
    const [tenantRow] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    const settings = (tenantRow?.settings ?? {}) as TenantSettings;
    const format = settings.invoiceFormat ?? '{prefix}-{fy}-{seq}';
    const prefix = settings.invoicePrefix ?? 'INV';
    const fy = this.getCurrentFY(settings.financialYearStartMonth ?? 4);
    const fy2 = fy.slice(0, 2);

    // Build a regex from the format by replacing placeholders with capture groups
    const escaped = format
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex chars
      .replace('\\{prefix\\}', escapeRegex(prefix))
      .replace('\\{fy2\\}', escapeRegex(fy2))
      .replace('\\{fy\\}', escapeRegex(fy))
      .replace('\\{seq\\}', '(\\d+)');

    const re = new RegExp(`^${escaped}$`);
    let maxSeq = 0;

    for (const num of invoiceNumbers) {
      const m = num.match(re);
      if (m?.[1]) {
        const seq = parseInt(m[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      } else {
        // Fallback: if format doesn't match, use trailing digits
        const trailing = num.match(/(\d+)$/);
        if (trailing) {
          const seq = parseInt(trailing[1]!, 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      }
    }

    return maxSeq;
  }

  /**
   * Bump the invoice sequence counter so it's at least `minSeq`.
   * Called after import to keep manual invoices in sequence.
   */
  async syncSequenceToAtLeast(minSeq: number): Promise<void> {
    const [tenantRow] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    const settings = (tenantRow?.settings ?? {}) as TenantSettings;
    const fy = this.getCurrentFY(settings.financialYearStartMonth ?? 4);

    await this.db
      .insert(invoiceSequences)
      .values({ tenantId: this.tenantId, financialYear: fy, lastSequence: minSeq })
      .onConflictDoUpdate({
        target: [invoiceSequences.tenantId, invoiceSequences.financialYear],
        set: {
          lastSequence: sql`GREATEST(${invoiceSequences.lastSequence}, ${minSeq})`,
          updatedAt: new Date(),
        },
      });
  }

  async update(id: string, input: UpdateSalesInvoiceInput): Promise<SalesInvoiceWithDetails> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Invoice can only be updated in draft status');
    }

    return this.db.transaction(async (tx) => {
      // If line items were sent, recompute GST server-side from authoritative
      // tax data (place of supply + per-line tax rate). Never trust the
      // client-provided subtotal/taxAmount/totalAmount when items change —
      // they don't include the per-line CGST/SGST/IGST breakdown the print
      // template + GL postings need.
      let gst: Awaited<ReturnType<typeof this.computeGstForInvoice>> | null = null;
      if (input.items && input.items.length > 0) {
        const customerId = input.customerId ?? existing.customerId;
        gst = await this.computeGstForInvoice(
          tx,
          customerId,
          input.items,
          input.reverseCharge ?? existing.reverseCharge,
        );
      }

      await tx
        .update(salesInvoices)
        .set({
          ...(input.customerId !== undefined && { customerId: input.customerId }),
          ...(input.invoiceDate !== undefined && { invoiceDate: input.invoiceDate }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
          ...(input.notes !== undefined && { notes: input.notes ?? null }),
          ...(input.poNumber !== undefined && { poNumber: input.poNumber ?? null }),
          // GST recompute path — only when items were sent
          ...(gst && {
            subtotal: String(gst.summary.subtotal),
            taxAmount: String(gst.summary.taxAmount),
            totalAmount: String(gst.summary.totalAmount),
            balanceDue: String(gst.summary.totalAmount),
            cgstAmount: String(gst.summary.cgstAmount),
            sgstAmount: String(gst.summary.sgstAmount),
            igstAmount: String(gst.summary.igstAmount),
            cessAmount: String(gst.summary.cessAmount),
            placeOfSupply: gst.placeOfSupply?.placeOfSupply ?? null,
            placeOfSupplyCode: gst.placeOfSupply?.placeOfSupplyCode ?? null,
            isInterState: gst.placeOfSupply?.isInterState ?? null,
          }),
          // Header-only edit path — fall back to client-provided totals
          ...(!gst && input.subtotal !== undefined && { subtotal: String(input.subtotal) }),
          ...(!gst && input.taxAmount !== undefined && { taxAmount: String(input.taxAmount) }),
          ...(!gst && input.totalAmount !== undefined && {
            totalAmount: String(input.totalAmount),
            balanceDue: String(input.totalAmount),
          }),
          updatedAt: new Date(),
        })
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)));

      if (input.items && input.items.length > 0 && gst) {
        await this.replaceLineItemsWithGst(tx, id, input.items, gst.itemTaxes);
      }

      return this.getById(id);
    });
  }

  /**
   * HSN/SAC classification fix for already-issued invoices.
   *
   * Bypasses the draft-only edit block because HSN is a tax classification,
   * not a financial figure — changing it does not affect GL, totals, or
   * balance due. Allowed on any non-cancelled invoice (sent, partially_paid,
   * paid, overdue) so the user can fix GSTR-1 readiness on already-paid
   * invoices without issuing a credit note.
   *
   * Touches only sales_invoice_items.hsn_sac_code. Audit-logged.
   */
  async updateLineHsn(
    id: string,
    items: Array<{ id: string; hsnSacCode: string }>,
    userId?: string,
  ): Promise<SalesInvoiceWithDetails> {
    const existing = await this.getById(id);
    if (existing.status === 'cancelled') {
      throw new ConflictError('Cannot update HSN on a cancelled invoice');
    }

    const before = existing.items
      .filter((it) => items.some((x) => x.id === it.id))
      .reduce<Record<string, string | null>>((acc, it) => {
        acc[it.id] = it.hsnSacCode ?? null;
        return acc;
      }, {});

    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(salesInvoiceItems)
          .set({ hsnSacCode: item.hsnSacCode, updatedAt: new Date() })
          .where(and(
            eq(salesInvoiceItems.id, item.id),
            eq(salesInvoiceItems.invoiceId, id),
            eq(salesInvoiceItems.tenantId, this.tenantId),
          ));
      }
      await tx
        .update(salesInvoices)
        .set({ updatedAt: new Date() })
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)));
    });

    const audit = new AuditService(this.db, this.tenantId);
    const changes = items.reduce<Record<string, { old: unknown; new: unknown }>>((acc, it) => {
      acc[`item.${it.id}.hsnSacCode`] = { old: before[it.id] ?? null, new: it.hsnSacCode };
      return acc;
    }, {});
    await audit.log({
      userId,
      action: 'updated_hsn',
      entityType: 'sales_invoice',
      entityId: id,
      changes,
      metadata: { reason: 'GST classification fix on issued invoice', invoiceStatus: existing.status },
    });

    return this.getById(id);
  }

  async cancel(id: string): Promise<SalesInvoice> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft invoices can be cancelled');
    }

    const [row] = await this.db
      .update(salesInvoices)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
      .returning();

    return this.toInvoice(row!);
  }

  /**
   * Hard-delete an invoice. Distinct from cancel(): this physically
   * removes the row from sales_invoices (line items cascade via FK).
   * Used to purge mistakes from imports / typos / test data.
   *
   * Refuses unless:
   *   - status is 'draft' or 'cancelled' (never delete sent/paid invoices —
   *     they have GST implications and the books expect them to exist)
   *   - no payment receipts have been allocated to this invoice
   *   - no credit notes reference this invoice
   *   - no collection assignments reference this invoice
   *   - no dunning log entries have been sent for this invoice
   *   - no GL journal entries were posted against this invoice
   *
   * The po_drafts.approvedInvoiceId back-reference is nulled (it's a
   * non-blocking pointer used to surface "this PO became invoice X" in
   * the inbox UI — losing the link is fine).
   *
   * Whole flow runs in a single transaction so a partial failure leaves
   * nothing half-deleted.
   */
  async hardDelete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new ConflictError(
        `Only draft or cancelled invoices can be deleted (current status: ${existing.status})`,
      );
    }

    await this.db.transaction(async (tx) => {
      // Pre-flight dependency checks. Each one is a count query against
      // a single indexed column — cheap. Done up-front, in the same tx,
      // so concurrent writes can't slip a payment in between the check
      // and the delete.
      const blockers: string[] = [];

      const [allocCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(receiptAllocations)
        .where(
          and(
            eq(receiptAllocations.invoiceId, id),
            eq(receiptAllocations.tenantId, this.tenantId),
          ),
        );
      if ((allocCount?.n ?? 0) > 0) blockers.push('payment receipts allocated to this invoice');

      const [creditCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(creditNotes)
        .where(
          and(eq(creditNotes.invoiceId, id), eq(creditNotes.tenantId, this.tenantId)),
        );
      if ((creditCount?.n ?? 0) > 0) blockers.push('credit notes referencing this invoice');

      const [assignCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(collectionAssignments)
        .where(
          and(
            eq(collectionAssignments.invoiceId, id),
            eq(collectionAssignments.tenantId, this.tenantId),
          ),
        );
      if ((assignCount?.n ?? 0) > 0) blockers.push('collection assignments');

      const [dunCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(dunningLog)
        .where(and(eq(dunningLog.invoiceId, id), eq(dunningLog.tenantId, this.tenantId)));
      if ((dunCount?.n ?? 0) > 0) blockers.push('dunning log entries');

      const [glCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.tenantId, this.tenantId),
            eq(journalEntries.sourceType, 'sales_invoice'),
            eq(journalEntries.sourceId, id),
          ),
        );
      if ((glCount?.n ?? 0) > 0) blockers.push('GL journal entries posted against this invoice');

      if (blockers.length > 0) {
        throw new ConflictError(
          `Cannot delete invoice ${existing.invoiceNumber}: ${blockers.join(', ')}. Discard (cancel) it instead to preserve the audit trail.`,
        );
      }

      // Null the non-blocking back-ref from PO drafts. The PO that became
      // this invoice still exists; it just no longer points to a deleted row.
      await tx
        .update(poDrafts)
        .set({ approvedInvoiceId: null })
        .where(
          and(eq(poDrafts.approvedInvoiceId, id), eq(poDrafts.tenantId, this.tenantId)),
        );

      // Now delete. sales_invoice_items has ON DELETE CASCADE on its FK
      // to sales_invoices, so the line items vanish with the parent.
      await tx
        .delete(salesInvoices)
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)));

      // Try to reclaim the invoice number so there's no gap. We parse the
      // sequence number from the invoice number format and check if it
      // matches the current FY counter. If it does, decrement the counter
      // so the next invoice reuses this number. Only works for the LAST
      // invoice in the sequence — older gaps aren't filled (would require
      // a free-list, which is overkill for the common "delete the one I
      // just created" use case).
      try {
        const [tenantRow] = await tx
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, this.tenantId))
          .limit(1);
        const settings = (tenantRow?.settings ?? {}) as TenantSettings;
        const fy = this.getCurrentFY(settings.financialYearStartMonth ?? 4);

        // Extract the raw sequence number from the formatted invoice number.
        // The format uses {seq} which is zero-padded. We strip the prefix/fy
        // parts and parse the remaining digits.
        const padding = settings.invoiceSequencePadding ?? 4;
        const seqStr = existing.invoiceNumber.slice(-(padding));
        const deletedSeq = Number(seqStr);

        if (Number.isFinite(deletedSeq) && deletedSeq > 0) {
          // Only decrement if the deleted invoice WAS the last in the sequence
          const [seqRow] = await tx
            .select({ lastSequence: invoiceSequences.lastSequence })
            .from(invoiceSequences)
            .where(
              and(
                eq(invoiceSequences.tenantId, this.tenantId),
                eq(invoiceSequences.financialYear, fy),
              ),
            )
            .limit(1);

          if (seqRow && seqRow.lastSequence === deletedSeq) {
            await tx
              .update(invoiceSequences)
              .set({ lastSequence: deletedSeq - 1, updatedAt: new Date() })
              .where(
                and(
                  eq(invoiceSequences.tenantId, this.tenantId),
                  eq(invoiceSequences.financialYear, fy),
                ),
              );
          }
        }
      } catch {
        // Sequence reclaim is best-effort — don't fail the delete if
        // the number parsing or decrement fails for any reason.
      }
    });
  }

  /**
   * Batch status update. Transitions multiple invoices at once (e.g.
   * draft → sent after a bulk import). Silently skips invoices whose
   * current status doesn't allow the requested transition. Returns
   * counts so the UI can report what happened.
   *
   * Allowed transitions:
   *   draft → sent
   *   draft → cancelled
   */
  async batchUpdateStatus(
    invoiceIds: string[],
    targetStatus: 'sent' | 'cancelled',
  ): Promise<{ updated: number; skipped: { id: string; reason: string }[] }> {
    const allowedFrom: SalesInvoiceStatus = 'draft';
    const skipped: { id: string; reason: string }[] = [];

    // Single UPDATE ... WHERE id IN (...) AND status = 'draft' handles
    // the transition atomically. Anything that doesn't match the WHERE
    // is effectively skipped.
    const result = await this.db
      .update(salesInvoices)
      .set({ status: targetStatus, updatedAt: new Date() })
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          inArray(salesInvoices.id, invoiceIds),
          eq(salesInvoices.status, allowedFrom),
        ),
      )
      .returning({ id: salesInvoices.id });

    const updatedIds = new Set(result.map((r) => r.id));
    for (const id of invoiceIds) {
      if (!updatedIds.has(id)) {
        skipped.push({ id, reason: `Not in '${allowedFrom}' status` });
      }
    }

    return { updated: updatedIds.size, skipped };
  }

  async send(id: string, input: SendInvoiceInput, userId?: string): Promise<SalesInvoice> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft invoices can be sent');
    }

    const [row] = await this.db
      .update(salesInvoices)
      .set({ status: 'sent', updatedAt: new Date() })
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
      .returning();

    await this.audit().log({ userId, action: 'sent', entityType: 'sales_invoice', entityId: id });
    const invoice = this.toInvoice(row!);

    if (input.channel === 'whatsapp') {
      void this.sendInvoiceWhatsApp(invoice, existing.customerId, existing.customerName, input.whatsappTo);
    } else {
      void this.sendInvoiceEmail(invoice, existing.customerId, existing.customerName);
    }

    return invoice;
  }

  private async sendInvoiceWhatsApp(
    invoice: SalesInvoice,
    customerId: string,
    customerName: string,
    whatsappTo?: string | null,
  ): Promise<void> {
    const provider = getMessageProvider();
    if (!provider) return;

    const phone = whatsappTo ?? await this.getCustomerPhone(customerId);
    if (!phone) return;

    const companyName = await getTenantName(this.db, this.tenantId);
    provider.sendWhatsApp({
      to: phone,
      templateName: 'invoice_sent',
      templateParams: {
        company: companyName,
        customer: customerName,
        invoiceNumber: invoice.invoiceNumber,
        amount: `₹${invoice.totalAmount.toFixed(2)}`,
        dueDate: invoice.dueDate,
      },
    }).catch((err) => console.error('WhatsApp invoice send failed:', err));
  }

  private async getCustomerPhone(customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    return row?.phone ?? null;
  }

  private async sendInvoiceEmail(invoice: SalesInvoice, customerId: string, customerName: string): Promise<void> {
    const [customerRow] = await this.db
      .select({ email: customers.email, paymentTermsDays: customers.paymentTermsDays })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customerRow?.email) return;

    const companyName = await getTenantName(this.db, this.tenantId);
    const template = invoiceSent({
      customerName,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      terms: customerRow.paymentTermsDays,
      companyName,
    });

    sendEmail({ to: customerRow.email, fromName: companyName, ...template }).catch((err) =>
      console.error('Invoice email failed:', err),
    );
  }

  async markPaid(id: string, input: MarkPaidInput): Promise<SalesInvoiceWithDetails> {
    const existing = await this.getById(id);
    if (!['sent', 'partially_paid', 'overdue', 'draft'].includes(existing.status)) {
      throw new ConflictError('Invoice cannot be marked as paid in its current status');
    }

    const allocationSum = await this.db
      .select({ total: sql<number>`coalesce(sum(${receiptAllocations.amount}), 0)::float` })
      .from(receiptAllocations)
      .where(and(eq(receiptAllocations.invoiceId, id), eq(receiptAllocations.tenantId, this.tenantId)));

    const alreadyAllocated = allocationSum[0]?.total ?? 0;
    const balanceDue = existing.totalAmount - alreadyAllocated;

    if (balanceDue <= 0) throw new ConflictError('Invoice already fully paid');

    return this.db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(paymentReceipts)
        .values({
          tenantId: this.tenantId,
          customerId: existing.customerId,
          receiptDate: input.paymentDate,
          amount: String(balanceDue),
          paymentMethod: 'bank_transfer',
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      await tx.insert(receiptAllocations).values({
        tenantId: this.tenantId,
        receiptId: receipt!.id,
        invoiceId: id,
        amount: String(balanceDue),
      });

      // Post receipt to GL
      const gl = new GLService(tx as unknown as Db, this.tenantId);
      await gl.postReceipt({
        amount: balanceDue,
        date: input.paymentDate,
        id: receipt!.id,
        customerName: existing.customerName,
      });

      const newAmountReceived = alreadyAllocated + balanceDue;
      const [row] = await tx
        .update(salesInvoices)
        .set({
          status: 'paid',
          amountReceived: String(newAmountReceived),
          balanceDue: '0',
          updatedAt: new Date(),
        })
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
        .returning();

      const itemRows = await tx
        .select()
        .from(salesInvoiceItems)
        .where(and(eq(salesInvoiceItems.invoiceId, id), eq(salesInvoiceItems.tenantId, this.tenantId)));

      return {
        ...this.toInvoice(row!),
        customerName: existing.customerName,
        customerNickname: existing.customerNickname ?? null,
        customerEmail: existing.customerEmail ?? null,
        customerPhone: existing.customerPhone ?? null,
        items: itemRows.map(this.toInvoiceItem),
      };
    });
  }

  /**
   * Settle a sales invoice against the customer wallet (2102 Advance from
   * Customers). For wallet/prepaid platforms — the bank credit was booked
   * earlier as a wallet recharge, so the receipt JE moves the liability
   * down instead of moving cash up. Same shape as `markPaid` otherwise.
   */
  async markPaidFromWallet(id: string, input: MarkPaidInput): Promise<SalesInvoiceWithDetails> {
    const existing = await this.getById(id);
    if (!['sent', 'partially_paid', 'overdue', 'draft'].includes(existing.status)) {
      throw new ConflictError('Invoice cannot be marked as paid in its current status');
    }

    const allocationSum = await this.db
      .select({ total: sql<number>`coalesce(sum(${receiptAllocations.amount}), 0)::float` })
      .from(receiptAllocations)
      .where(and(eq(receiptAllocations.invoiceId, id), eq(receiptAllocations.tenantId, this.tenantId)));

    const alreadyAllocated = allocationSum[0]?.total ?? 0;
    const balanceDue = existing.totalAmount - alreadyAllocated;
    if (balanceDue <= 0) throw new ConflictError('Invoice already fully paid');

    return this.db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(paymentReceipts)
        .values({
          tenantId: this.tenantId,
          customerId: existing.customerId,
          receiptDate: input.paymentDate,
          amount: String(balanceDue),
          paymentMethod: 'bank_transfer',
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? 'Paid from customer wallet',
        })
        .returning();

      await tx.insert(receiptAllocations).values({
        tenantId: this.tenantId,
        receiptId: receipt!.id,
        invoiceId: id,
        amount: String(balanceDue),
      });

      const gl = new GLService(tx as unknown as Db, this.tenantId);
      await gl.postWalletReceipt({
        amount: balanceDue,
        date: input.paymentDate,
        id: receipt!.id,
        customerName: existing.customerName,
      });

      const newAmountReceived = alreadyAllocated + balanceDue;
      const [row] = await tx
        .update(salesInvoices)
        .set({
          status: 'paid',
          amountReceived: String(newAmountReceived),
          balanceDue: '0',
          updatedAt: new Date(),
        })
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
        .returning();

      const itemRows = await tx
        .select()
        .from(salesInvoiceItems)
        .where(and(eq(salesInvoiceItems.invoiceId, id), eq(salesInvoiceItems.tenantId, this.tenantId)));

      return {
        ...this.toInvoice(row!),
        customerName: existing.customerName,
        customerNickname: existing.customerNickname ?? null,
        customerEmail: existing.customerEmail ?? null,
        customerPhone: existing.customerPhone ?? null,
        items: itemRows.map(this.toInvoiceItem),
      };
    });
  }

  async getReceiptsForInvoice(invoiceId: string) {
    const rows = await this.db
      .select({
        id: paymentReceipts.id,
        receiptDate: paymentReceipts.receiptDate,
        amount: receiptAllocations.amount,
        paymentMethod: paymentReceipts.paymentMethod,
        referenceNumber: paymentReceipts.referenceNumber,
        notes: paymentReceipts.notes,
      })
      .from(receiptAllocations)
      .innerJoin(paymentReceipts, eq(receiptAllocations.receiptId, paymentReceipts.id))
      .where(and(
        eq(receiptAllocations.invoiceId, invoiceId),
        eq(receiptAllocations.tenantId, this.tenantId),
      ))
      .orderBy(paymentReceipts.receiptDate);

    return rows.map((r) => ({
      id: r.id,
      receiptDate: r.receiptDate,
      amount: Number(r.amount),
      paymentMethod: r.paymentMethod,
      referenceNumber: r.referenceNumber ?? null,
      notes: r.notes ?? null,
    }));
  }

  private getCurrentFY(startMonth: number): string {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const fyStart = month >= startMonth ? year : year - 1;
    const fyEnd = fyStart + 1;
    return `${String(fyStart).slice(-2)}${String(fyEnd).slice(-2)}`;
  }

  private formatInvoiceNumber(settings: TenantSettings, fy: string, seq: number): string {
    const prefix = settings.invoicePrefix ?? 'INV';
    const format = settings.invoiceFormat ?? '{prefix}-{fy}-{seq}';
    const padding = settings.invoiceSequencePadding ?? 4;
    const paddedSeq = String(seq).padStart(padding, '0');
    // {fy2} is the 2-digit FY start year, e.g. "26" for FY 2026-27.
    // {fy} stays as the 4-digit form ("2627") for backwards compatibility.
    const fy2 = fy.slice(0, 2);
    return format
      .replace('{prefix}', prefix)
      .replace('{fy2}', fy2)
      .replace('{fy}', fy)
      .replace('{seq}', paddedSeq);
  }

  private async replaceLineItems(
    invoiceId: string,
    items: NonNullable<UpdateSalesInvoiceInput['items']>,
  ): Promise<void> {
    await this.db
      .delete(salesInvoiceItems)
      .where(and(eq(salesInvoiceItems.invoiceId, invoiceId), eq(salesInvoiceItems.tenantId, this.tenantId)));

    await this.db.insert(salesInvoiceItems).values(
      items.map((item) => {
        const pack = item.itemId ? null : defaultPackSize(item.hsnSacCode, item.uom);
        return {
          tenantId: this.tenantId,
          invoiceId,
          itemId: item.itemId ?? null,
          description: item.description!,
          uom: item.uom ?? null,
          ...(pack ? { packSizeValue: String(pack.packSizeValue), packSizeUqc: pack.packSizeUqc } : {}),
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          amount: String(item.amount),
          hsnSacCode: item.hsnSacCode ?? null,
          taxCategory: (item.taxCategory as TaxCategory) ?? null,
          taxRate: item.taxRate != null ? String(item.taxRate) : null,
        };
      }),
    );
  }

  /**
   * Like replaceLineItems but ALSO writes the per-line CGST/SGST/IGST/Cess
   * columns from the server-computed itemTaxes. Used by update() so editing
   * an invoice doesn't silently zero out the line-level GST breakdown that
   * the print template + HSN summary depend on.
   */
  private async replaceLineItemsWithGst(
    tx: AnyTx,
    invoiceId: string,
    items: NonNullable<UpdateSalesInvoiceInput['items']>,
    itemTaxes: TaxBreakdown[],
  ): Promise<void> {
    await tx
      .delete(salesInvoiceItems)
      .where(and(eq(salesInvoiceItems.invoiceId, invoiceId), eq(salesInvoiceItems.tenantId, this.tenantId)));

    await tx.insert(salesInvoiceItems).values(
      items.map((item, i) => {
        const tax = itemTaxes[i]!;
        const pack = item.itemId ? null : defaultPackSize(item.hsnSacCode, item.uom);
        return {
          tenantId: this.tenantId,
          invoiceId,
          itemId: item.itemId ?? null,
          description: item.description!,
          uom: item.uom ?? null,
          ...(pack ? { packSizeValue: String(pack.packSizeValue), packSizeUqc: pack.packSizeUqc } : {}),
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
        };
      }),
    );
  }

  async summary(filters: SalesInvoiceFilter = {}): Promise<InvoiceSummary> {
    const today = new Date().toISOString().split('T')[0]!;

    // Common filter scope: customer, date range, and free-text search apply to
    // every metric. We intentionally do NOT apply `status` here so individual
    // metric cards (drafts, overdue, received) still mean what their label
    // says — `status` filter scopes the table, not the breakdown cards.
    const tenant = eq(salesInvoices.tenantId, this.tenantId);
    const customerScope = filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined;
    const dateFrom = filters.dateFrom ? gte(salesInvoices.invoiceDate, filters.dateFrom) : undefined;
    const dateTo = filters.dateTo ? lte(salesInvoices.invoiceDate, filters.dateTo) : undefined;
    const search = filters.search
      ? sql`(${salesInvoices.invoiceNumber} ILIKE ${'%' + filters.search + '%'}
          OR ${customers.name} ILIKE ${'%' + filters.search + '%'}
          OR ${customers.nickname} ILIKE ${'%' + filters.search + '%'})`
      : undefined;

    // Always inner-join customers so the same WHERE shape works whether or not
    // search is provided. Every invoice has a customer, so the join is total.
    const [sales, outstanding, overdue, drafts, totalReceived, pending] = await Promise.all([
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${salesInvoices.totalAmount}), 0)::text` })
        .from(salesInvoices)
        .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
        .where(and(
          tenant, customerScope, dateFrom, dateTo, search,
          sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
        )),
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${salesInvoices.balanceDue}), 0)::text` })
        .from(salesInvoices)
        .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
        .where(and(
          tenant, customerScope, dateFrom, dateTo, search,
          sql`${salesInvoices.status} NOT IN ('paid', 'cancelled', 'draft')`,
        )),
      this.db
        .select({
          count: sql<number>`COUNT(*)::int`,
          amount: sql<string>`COALESCE(SUM(${salesInvoices.balanceDue}), 0)::text`,
        })
        .from(salesInvoices)
        .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
        .where(and(
          tenant, customerScope, dateFrom, dateTo, search,
          sql`${salesInvoices.dueDate} < ${today}`,
          sql`${salesInvoices.status} IN ('sent', 'partially_paid')`,
          sql`${salesInvoices.balanceDue} > 0`,
        )),
      this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(salesInvoices)
        .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
        .where(and(
          tenant, customerScope, dateFrom, dateTo, search,
          eq(salesInvoices.status, 'draft'),
        )),
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${salesInvoices.amountReceived}), 0)::text` })
        .from(salesInvoices)
        .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
        .where(and(
          tenant, customerScope, dateFrom, dateTo, search,
          sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
        )),
      this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(salesInvoices)
        .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
        .where(and(
          tenant, customerScope, dateFrom, dateTo, search,
          sql`${salesInvoices.status} IN ('sent', 'partially_paid')`,
          sql`${salesInvoices.balanceDue} > 0`,
        )),
    ]);

    return {
      totalSales: Number(sales[0]?.total ?? 0),
      totalReceived: Number(totalReceived[0]?.total ?? 0),
      totalOutstanding: Number(outstanding[0]?.total ?? 0),
      overdueCount: overdue[0]?.count ?? 0,
      overdueAmount: Number(overdue[0]?.amount ?? 0),
      draftCount: drafts[0]?.count ?? 0,
      pendingCount: pending[0]?.count ?? 0,
    };
  }

  private buildWhereClause(filters: SalesInvoiceFilter) {
    const isOverdueFilter = filters.status === 'overdue';
    const isUnpaidFilter = filters.status === 'unpaid';
    return and(
      eq(salesInvoices.tenantId, this.tenantId),
      filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined,
      isOverdueFilter
        ? sql`${salesInvoices.dueDate} < CURRENT_DATE AND ${salesInvoices.balanceDue} > 0 AND ${salesInvoices.status} IN ('sent', 'partially_paid')`
        : isUnpaidFilter
        ? sql`${salesInvoices.balanceDue} > 0 AND ${salesInvoices.status} IN ('sent', 'partially_paid')`
        : filters.status
        ? eq(salesInvoices.status, filters.status as Exclude<typeof filters.status, 'unpaid'>)
        : undefined,
      filters.overdue
        ? sql`${salesInvoices.dueDate} < CURRENT_DATE AND ${salesInvoices.balanceDue} > 0`
        : undefined,
      filters.search
        ? sql`(${salesInvoices.invoiceNumber} ILIKE ${'%' + filters.search + '%'}
            OR ${customers.name} ILIKE ${'%' + filters.search + '%'}
            OR ${customers.nickname} ILIKE ${'%' + filters.search + '%'})`
        : undefined,
      filters.dateFrom ? gte(salesInvoices.invoiceDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(salesInvoices.invoiceDate, filters.dateTo) : undefined,
    );
  }

  private computeEffectiveStatus(invoice: { status: SalesInvoiceStatus; dueDate: string }): SalesInvoiceStatus {
    if (invoice.status === 'sent' || invoice.status === 'partially_paid') {
      const today = new Date().toISOString().split('T')[0]!;
      if (invoice.dueDate < today) return 'overdue';
    }
    return invoice.status;
  }

  private toInvoice(row: typeof salesInvoices.$inferSelect): SalesInvoice {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceNumber: row.invoiceNumber,
      customerId: row.customerId,
      invoiceDate: row.invoiceDate,
      dueDate: row.dueDate,
      subtotal: Number(row.subtotal),
      taxAmount: Number(row.taxAmount),
      totalAmount: Number(row.totalAmount),
      amountReceived: Number(row.amountReceived),
      balanceDue: Number(row.balanceDue),
      status: this.computeEffectiveStatus({ status: row.status, dueDate: row.dueDate }),
      discountPercent: row.discountPercent != null ? Number(row.discountPercent) : null,
      discountDays: row.discountDays ?? null,
      notes: row.notes ?? null,
      poNumber: row.poNumber ?? null,
      fileUrl: row.fileUrl ?? null,
      placeOfSupply: row.placeOfSupply ?? null,
      placeOfSupplyCode: row.placeOfSupplyCode ?? null,
      isInterState: row.isInterState ?? null,
      cgstAmount: Number(row.cgstAmount),
      sgstAmount: Number(row.sgstAmount),
      igstAmount: Number(row.igstAmount),
      cessAmount: Number(row.cessAmount),
      reverseCharge: row.reverseCharge,
      wmsInvoiceId: row.wmsInvoiceId ?? null,
      irnNumber: row.irnNumber ?? null,
      irnDate: row.irnDate ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toInvoiceItem(row: typeof salesInvoiceItems.$inferSelect): SalesInvoiceItem {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      itemId: row.itemId ?? null,
      // Plain row mapper has no JOIN data — callers that need name/sku
      // should use queryInvoiceItemsWithMaster() instead.
      itemName: null,
      itemSku: null,
      description: row.description,
      uom: row.uom ?? null,
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
    };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

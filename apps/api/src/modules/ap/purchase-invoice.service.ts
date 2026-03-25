import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { purchaseInvoices, purchaseInvoiceItems, vendors, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PurchaseInvoice, PurchaseInvoiceItem, PurchaseInvoiceWithDetails, PaginationMeta, TaxCategory, TaxBreakdown } from '@runq/types';
import type { CreatePurchaseInvoiceInput, UpdatePurchaseInvoiceInput, PurchaseInvoiceFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';
import { determinePlaceOfSupply, calculateLineItemTax, calculateInvoiceTax, resolveStateCode } from '../../utils/gst-calculator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = NodePgDatabase<any> | PgTransaction<any, any, any>;

export interface InvoiceListParams {
  page: number;
  limit: number;
  filters: PurchaseInvoiceFilter;
}

export interface InvoiceListResult {
  data: (PurchaseInvoice & { vendorName: string })[];
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

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          invoice: purchaseInvoices,
          vendorName: vendors.name,
        })
        .from(purchaseInvoices)
        .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(purchaseInvoices)
        .where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({ ...this.toInvoice(r.invoice), vendorName: r.vendorName }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
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

      const [invoice] = await tx
        .insert(purchaseInvoices)
        .values({
          tenantId: this.tenantId,
          vendorId: input.vendorId,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          poId: input.poId ?? null,
          subtotal: String(gst.summary.subtotal),
          taxAmount: String(gst.summary.taxAmount),
          totalAmount: String(gst.summary.totalAmount),
          balanceDue: String(gst.summary.totalAmount),
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
    if (existing.status !== 'draft') {
      throw new ConflictError('Invoice can only be updated in draft status');
    }

    await this.db
      .update(purchaseInvoices)
      .set({
        ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
        ...(input.invoiceNumber !== undefined && { invoiceNumber: input.invoiceNumber }),
        ...(input.invoiceDate !== undefined && { invoiceDate: input.invoiceDate }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.poId !== undefined && { poId: input.poId ?? null }),
        ...(input.subtotal !== undefined && { subtotal: String(input.subtotal) }),
        ...(input.taxAmount !== undefined && { taxAmount: String(input.taxAmount) }),
        ...(input.totalAmount !== undefined && {
          totalAmount: String(input.totalAmount),
          balanceDue: String(input.totalAmount),
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)));

    if (input.items && input.items.length > 0) {
      await this.replaceLineItems(id, input.items);
    }

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

  private async replaceLineItems(
    invoiceId: string,
    items: NonNullable<UpdatePurchaseInvoiceInput['items']>,
  ): Promise<void> {
    await this.db
      .delete(purchaseInvoiceItems)
      .where(and(eq(purchaseInvoiceItems.invoiceId, invoiceId), eq(purchaseInvoiceItems.tenantId, this.tenantId)));

    await this.db.insert(purchaseInvoiceItems).values(
      items.map((item) => ({
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
        tdsSection: item.tdsSection ?? null,
        tdsRate: item.tdsRate != null ? String(item.tdsRate) : null,
      })),
    );
  }

  private buildWhereClause(filters: PurchaseInvoiceFilter) {
    return and(
      eq(purchaseInvoices.tenantId, this.tenantId),
      filters.vendorId ? eq(purchaseInvoices.vendorId, filters.vendorId) : undefined,
      filters.status ? eq(purchaseInvoices.status, filters.status) : undefined,
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

import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { purchaseInvoices, purchaseInvoiceItems, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { PurchaseInvoice, PurchaseInvoiceItem, PurchaseInvoiceWithDetails, PaginationMeta } from '@runq/types';
import type { CreatePurchaseInvoiceInput, UpdatePurchaseInvoiceInput, PurchaseInvoiceFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

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

  async create(input: CreatePurchaseInvoiceInput): Promise<PurchaseInvoiceWithDetails> {
    return this.db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(purchaseInvoices)
        .values({
          tenantId: this.tenantId,
          vendorId: input.vendorId,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          poId: input.poId ?? null,
          subtotal: String(input.subtotal),
          taxAmount: String(input.taxAmount),
          totalAmount: String(input.totalAmount),
          balanceDue: String(input.totalAmount),
          status: 'draft',
        })
        .returning();

      const items = await tx
        .insert(purchaseInvoiceItems)
        .values(
          input.items.map((item) => ({
            tenantId: this.tenantId,
            invoiceId: invoice!.id,
            itemName: item.itemName,
            sku: item.sku ?? null,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            amount: String(item.amount),
          })),
        )
        .returning();

      const [vendorRow] = await tx
        .select({ name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, input.vendorId))
        .limit(1);

      return {
        ...this.toInvoice(invoice!),
        vendorName: vendorRow?.name ?? '',
        items: items.map(this.toInvoiceItem),
      };
    });
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

  async cancel(id: string): Promise<PurchaseInvoice> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft' && existing.status !== 'pending_match') {
      throw new ConflictError('Only draft or pending match invoices can be cancelled');
    }

    const [row] = await this.db
      .update(purchaseInvoices)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)))
      .returning();

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
    };
  }
}

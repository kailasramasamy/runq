import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { salesInvoices, salesInvoiceItems, customers, invoiceSequences, tenants, paymentReceipts, receiptAllocations } from '@runq/db';
import type { Db } from '@runq/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { SalesInvoice, SalesInvoiceItem, SalesInvoiceWithDetails, PaginationMeta } from '@runq/types';
import type { CreateSalesInvoiceInput, UpdateSalesInvoiceInput, SalesInvoiceFilter, SendInvoiceInput, MarkPaidInput } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = NodePgDatabase<any> | PgTransaction<any, any, any>;

export interface InvoiceListParams {
  page: number;
  limit: number;
  filters: SalesInvoiceFilter;
}

export interface InvoiceListResult {
  data: (SalesInvoice & { customerName: string })[];
  meta: PaginationMeta;
}

interface TenantSettings {
  invoicePrefix?: string;
  invoiceFormat?: string;
  financialYearStartMonth?: number;
  invoiceSequencePadding?: number;
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
        .select({ invoice: salesInvoices, customerName: customers.name })
        .from(salesInvoices)
        .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(salesInvoices).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map((r) => ({ ...this.toInvoice(r.invoice), customerName: r.customerName }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<SalesInvoiceWithDetails> {
    const [row] = await this.db
      .select({ invoice: salesInvoices, customerName: customers.name })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('SalesInvoice');

    const itemRows = await this.db
      .select()
      .from(salesInvoiceItems)
      .where(and(eq(salesInvoiceItems.invoiceId, id), eq(salesInvoiceItems.tenantId, this.tenantId)));

    return {
      ...this.toInvoice(row.invoice),
      customerName: row.customerName,
      items: itemRows.map(this.toInvoiceItem),
    };
  }

  async getForPrint(id: string): Promise<{
    invoice: SalesInvoice;
    items: SalesInvoiceItem[];
    customer: typeof customers.$inferSelect;
    tenant: typeof tenants.$inferSelect;
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

    const itemRows = await this.db
      .select()
      .from(salesInvoiceItems)
      .where(and(eq(salesInvoiceItems.invoiceId, id), eq(salesInvoiceItems.tenantId, this.tenantId)));

    return {
      invoice: this.toInvoice(row.invoice),
      items: itemRows.map(this.toInvoiceItem),
      customer: row.customer,
      tenant: tenantRow!,
    };
  }

  async create(input: CreateSalesInvoiceInput, userId?: string): Promise<SalesInvoiceWithDetails> {
    return this.db.transaction(async (tx) => {
      const invoiceNumber = await this.resolveInvoiceNumber(tx);

      const [invoice] = await tx
        .insert(salesInvoices)
        .values({
          tenantId: this.tenantId,
          invoiceNumber,
          customerId: input.customerId,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          subtotal: String(input.subtotal),
          taxAmount: String(input.taxAmount),
          totalAmount: String(input.totalAmount),
          balanceDue: String(input.totalAmount),
          status: 'draft',
          notes: input.notes ?? null,
        })
        .returning();

      const items = await tx
        .insert(salesInvoiceItems)
        .values(
          input.items.map((item) => ({
            tenantId: this.tenantId,
            invoiceId: invoice!.id,
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            amount: String(item.amount),
          })),
        )
        .returning();

      const [customerRow] = await tx
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .limit(1);

      const result = {
        ...this.toInvoice(invoice!),
        customerName: customerRow?.name ?? '',
        items: items.map(this.toInvoiceItem),
      };
      await this.audit().log({ userId, action: 'created', entityType: 'sales_invoice', entityId: invoice!.id });
      return result;
    });
  }

  private async resolveInvoiceNumber(tx: AnyTx): Promise<string> {
    const [tenantRow] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    const settings = (tenantRow?.settings ?? {}) as TenantSettings;
    const fy = this.getCurrentFY(settings.financialYearStartMonth ?? 4);

    const [seqRow] = await tx
      .insert(invoiceSequences)
      .values({ tenantId: this.tenantId, financialYear: fy, lastSequence: 1 })
      .onConflictDoUpdate({
        target: [invoiceSequences.tenantId, invoiceSequences.financialYear],
        set: { lastSequence: sql`${invoiceSequences.lastSequence} + 1`, updatedAt: new Date() },
      })
      .returning();

    return this.formatInvoiceNumber(settings, fy, seqRow!.lastSequence);
  }

  async update(id: string, input: UpdateSalesInvoiceInput): Promise<SalesInvoiceWithDetails> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Invoice can only be updated in draft status');
    }

    await this.db
      .update(salesInvoices)
      .set({
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        ...(input.invoiceDate !== undefined && { invoiceDate: input.invoiceDate }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.subtotal !== undefined && { subtotal: String(input.subtotal) }),
        ...(input.taxAmount !== undefined && { taxAmount: String(input.taxAmount) }),
        ...(input.totalAmount !== undefined && {
          totalAmount: String(input.totalAmount),
          balanceDue: String(input.totalAmount),
        }),
        ...(input.notes !== undefined && { notes: input.notes ?? null }),
        updatedAt: new Date(),
      })
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, this.tenantId)));

    if (input.items && input.items.length > 0) {
      await this.replaceLineItems(id, input.items);
    }

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

  async send(id: string, _input: SendInvoiceInput, userId?: string): Promise<SalesInvoice> {
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
    return this.toInvoice(row!);
  }

  async markPaid(id: string, input: MarkPaidInput): Promise<SalesInvoiceWithDetails> {
    const existing = await this.getById(id);
    if (!['sent', 'partially_paid', 'overdue', 'draft'].includes(existing.status)) {
      throw new ConflictError('Invoice cannot be marked as paid in its current status');
    }

    return this.db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(paymentReceipts)
        .values({
          tenantId: this.tenantId,
          customerId: existing.customerId,
          receiptDate: input.paymentDate,
          amount: String(existing.balanceDue),
          paymentMethod: 'bank_transfer',
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      await tx.insert(receiptAllocations).values({
        tenantId: this.tenantId,
        receiptId: receipt!.id,
        invoiceId: id,
        amount: String(existing.balanceDue),
      });

      const [row] = await tx
        .update(salesInvoices)
        .set({
          status: 'paid',
          amountReceived: String(existing.totalAmount),
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
        items: itemRows.map(this.toInvoiceItem),
      };
    });
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
    return format
      .replace('{prefix}', prefix)
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
      items.map((item) => ({
        tenantId: this.tenantId,
        invoiceId,
        description: item.description!,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        amount: String(item.amount),
      })),
    );
  }

  private buildWhereClause(filters: SalesInvoiceFilter) {
    return and(
      eq(salesInvoices.tenantId, this.tenantId),
      filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined,
      filters.status ? eq(salesInvoices.status, filters.status) : undefined,
      filters.overdue
        ? sql`${salesInvoices.dueDate} < CURRENT_DATE AND ${salesInvoices.balanceDue} > 0`
        : undefined,
      filters.dateFrom ? gte(salesInvoices.invoiceDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(salesInvoices.invoiceDate, filters.dateTo) : undefined,
    );
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
      status: row.status,
      notes: row.notes ?? null,
      fileUrl: row.fileUrl ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toInvoiceItem(row: typeof salesInvoiceItems.$inferSelect): SalesInvoiceItem {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      description: row.description,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unitPrice),
      amount: Number(row.amount),
    };
  }
}

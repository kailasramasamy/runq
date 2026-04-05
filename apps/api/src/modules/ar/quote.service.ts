import { eq, and, sql, gte, lte, ilike } from 'drizzle-orm';
import { salesQuotes, salesQuoteItems, customers, salesInvoices, salesInvoiceItems, salesOrders, salesOrderItems } from '@runq/db';
import type { Db } from '@runq/db';
import type { SalesQuote, SalesQuoteItem, SalesQuoteWithDetails, QuoteStatus, PaginationMeta } from '@runq/types';
import type { CreateQuoteInput, UpdateQuoteInput, QuoteFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export interface QuoteListParams {
  page: number;
  limit: number;
  filters: QuoteFilter;
}

export interface QuoteListResult {
  data: (SalesQuote & { customerName: string })[];
  meta: PaginationMeta;
}

export class QuoteService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: QuoteListParams): Promise<QuoteListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(salesQuotes.tenantId, this.tenantId),
      filters.status ? eq(salesQuotes.status, filters.status) : undefined,
      filters.customerId ? eq(salesQuotes.customerId, filters.customerId) : undefined,
      filters.dateFrom ? gte(salesQuotes.quoteDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(salesQuotes.quoteDate, filters.dateTo) : undefined,
      filters.search ? ilike(salesQuotes.quoteNumber, `%${filters.search}%`) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          quote: salesQuotes,
          customerName: customers.name,
        })
        .from(salesQuotes)
        .innerJoin(customers, eq(salesQuotes.customerId, customers.id))
        .where(baseWhere)
        .orderBy(sql`${salesQuotes.createdAt} desc`)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(salesQuotes).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({ ...this.toQuote(r.quote), customerName: r.customerName })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<SalesQuoteWithDetails> {
    const [row] = await this.db
      .select({ quote: salesQuotes, customerName: customers.name })
      .from(salesQuotes)
      .innerJoin(customers, eq(salesQuotes.customerId, customers.id))
      .where(and(eq(salesQuotes.id, id), eq(salesQuotes.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Quote');

    const itemRows = await this.db
      .select()
      .from(salesQuoteItems)
      .where(and(eq(salesQuoteItems.quoteId, id), eq(salesQuoteItems.tenantId, this.tenantId)));

    return {
      ...this.toQuote(row.quote),
      customerName: row.customerName,
      items: itemRows.map((i) => this.toQuoteItem(i)),
    };
  }

  async create(input: CreateQuoteInput, userId: string): Promise<SalesQuoteWithDetails> {
    const quoteNumber = await this.generateQuoteNumber();

    const [quote] = await this.db
      .insert(salesQuotes)
      .values({
        tenantId: this.tenantId,
        customerId: input.customerId,
        quoteNumber,
        quoteDate: input.quoteDate,
        expiryDate: input.expiryDate ?? null,
        subtotal: input.subtotal.toString(),
        taxAmount: input.taxAmount.toString(),
        totalAmount: input.totalAmount.toString(),
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        createdBy: userId,
      })
      .returning();

    const itemValues = input.items.map((item) => ({
      tenantId: this.tenantId,
      quoteId: quote!.id,
      itemId: item.itemId ?? null,
      description: item.description,
      hsnSacCode: item.hsnSacCode ?? null,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      amount: item.amount.toString(),
      taxRate: item.taxRate?.toString() ?? null,
      taxAmount: ((item.amount * (item.taxRate ?? 0)) / 100).toFixed(2),
    }));

    await this.db.insert(salesQuoteItems).values(itemValues);
    return this.getById(quote!.id);
  }

  async update(id: string, input: UpdateQuoteInput): Promise<SalesQuoteWithDetails> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft' && existing.status !== 'sent') {
      throw new ConflictError('Only draft or sent quotes can be updated');
    }

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.customerId !== undefined) set.customerId = input.customerId;
    if (input.quoteDate !== undefined) set.quoteDate = input.quoteDate;
    if (input.expiryDate !== undefined) set.expiryDate = input.expiryDate ?? null;
    if (input.subtotal !== undefined) set.subtotal = input.subtotal.toString();
    if (input.taxAmount !== undefined) set.taxAmount = input.taxAmount.toString();
    if (input.totalAmount !== undefined) set.totalAmount = input.totalAmount.toString();
    if (input.notes !== undefined) set.notes = input.notes ?? null;
    if (input.terms !== undefined) set.terms = input.terms ?? null;

    await this.db.update(salesQuotes).set(set)
      .where(and(eq(salesQuotes.id, id), eq(salesQuotes.tenantId, this.tenantId)));

    if (input.items) {
      await this.db.delete(salesQuoteItems)
        .where(and(eq(salesQuoteItems.quoteId, id), eq(salesQuoteItems.tenantId, this.tenantId)));

      const itemValues = input.items.map((item) => ({
        tenantId: this.tenantId,
        quoteId: id,
        itemId: item.itemId ?? null,
        description: item.description!,
        hsnSacCode: item.hsnSacCode ?? null,
        quantity: item.quantity!.toString(),
        unitPrice: item.unitPrice!.toString(),
        amount: item.amount!.toString(),
        taxRate: item.taxRate?.toString() ?? null,
        taxAmount: ((item.amount! * (item.taxRate ?? 0)) / 100).toFixed(2),
      }));

      await this.db.insert(salesQuoteItems).values(itemValues);
    }

    return this.getById(id);
  }

  async updateStatus(id: string, status: QuoteStatus): Promise<SalesQuote> {
    const [row] = await this.db
      .update(salesQuotes)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(salesQuotes.id, id), eq(salesQuotes.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Quote');
    return this.toQuote(row);
  }

  async convertToInvoice(id: string): Promise<{ invoiceId: string }> {
    const quote = await this.getById(id);
    if (quote.status === 'converted') throw new ConflictError('Quote already converted');

    const today = new Date().toISOString().split('T')[0]!;
    const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]!;

    const [invoice] = await this.db
      .insert(salesInvoices)
      .values({
        tenantId: this.tenantId,
        customerId: quote.customerId,
        invoiceNumber: `INV-FROM-${quote.quoteNumber}`,
        invoiceDate: today,
        dueDate,
        subtotal: quote.subtotal.toString(),
        taxAmount: quote.taxAmount.toString(),
        totalAmount: quote.totalAmount.toString(),
        balanceDue: quote.totalAmount.toString(),
      })
      .returning();

    const invoiceItems = quote.items.map((item) => ({
      tenantId: this.tenantId,
      invoiceId: invoice!.id,
      description: item.description,
      hsnSacCode: item.hsnSacCode,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      amount: item.amount.toString(),
      taxRate: item.taxRate?.toString() ?? null,
    }));

    await this.db.insert(salesInvoiceItems).values(invoiceItems);

    await this.db.update(salesQuotes)
      .set({ status: 'converted', convertedToInvoiceId: invoice!.id, updatedAt: new Date() })
      .where(eq(salesQuotes.id, id));

    return { invoiceId: invoice!.id };
  }

  async convertToOrder(id: string): Promise<{ orderId: string }> {
    const quote = await this.getById(id);
    if (quote.status === 'converted') throw new ConflictError('Quote already converted');

    const orderNumber = await this.generateOrderNumber();
    const today = new Date().toISOString().split('T')[0]!;

    const [order] = await this.db
      .insert(salesOrders)
      .values({
        tenantId: this.tenantId,
        customerId: quote.customerId,
        orderNumber,
        orderDate: today,
        subtotal: quote.subtotal.toString(),
        taxAmount: quote.taxAmount.toString(),
        totalAmount: quote.totalAmount.toString(),
        quoteId: id,
        createdBy: quote.createdBy,
      })
      .returning();

    const orderItems = quote.items.map((item) => ({
      tenantId: this.tenantId,
      orderId: order!.id,
      itemId: item.itemId,
      description: item.description,
      hsnSacCode: item.hsnSacCode,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      amount: item.amount.toString(),
      taxRate: item.taxRate?.toString() ?? null,
      taxAmount: item.taxAmount.toString(),
    }));

    await this.db.insert(salesOrderItems).values(orderItems);

    await this.db.update(salesQuotes)
      .set({ status: 'converted', convertedToOrderId: order!.id, updatedAt: new Date() })
      .where(eq(salesQuotes.id, id));

    return { orderId: order!.id };
  }

  private async generateQuoteNumber(): Promise<string> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesQuotes)
      .where(eq(salesQuotes.tenantId, this.tenantId));

    const seq = (result?.count ?? 0) + 1;
    return `QUO-${seq.toString().padStart(4, '0')}`;
  }

  private async generateOrderNumber(): Promise<string> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesOrders)
      .where(eq(salesOrders.tenantId, this.tenantId));

    const seq = (result?.count ?? 0) + 1;
    return `SO-${seq.toString().padStart(4, '0')}`;
  }

  private toQuote(row: typeof salesQuotes.$inferSelect): SalesQuote {
    return {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      quoteNumber: row.quoteNumber,
      quoteDate: row.quoteDate,
      expiryDate: row.expiryDate,
      subtotal: toNumber(row.subtotal),
      taxAmount: toNumber(row.taxAmount),
      totalAmount: toNumber(row.totalAmount),
      status: row.status,
      notes: row.notes,
      terms: row.terms,
      convertedToInvoiceId: row.convertedToInvoiceId,
      convertedToOrderId: row.convertedToOrderId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toQuoteItem(row: typeof salesQuoteItems.$inferSelect): SalesQuoteItem {
    return {
      id: row.id,
      tenantId: row.tenantId,
      quoteId: row.quoteId,
      itemId: row.itemId,
      description: row.description,
      hsnSacCode: row.hsnSacCode,
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unitPrice),
      amount: toNumber(row.amount),
      taxRate: row.taxRate ? toNumber(row.taxRate) : null,
      taxAmount: toNumber(row.taxAmount),
    };
  }
}

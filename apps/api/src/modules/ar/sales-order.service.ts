import { eq, and, sql, gte, lte, ilike } from 'drizzle-orm';
import { salesOrders, salesOrderItems, customers, salesInvoices, salesInvoiceItems } from '@runq/db';
import type { Db } from '@runq/db';
import type { SalesOrder, SalesOrderItem, SalesOrderWithDetails, SalesOrderStatus, PaginationMeta } from '@runq/types';
import type { CreateSalesOrderInput, UpdateSalesOrderInput, SalesOrderFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export interface SalesOrderListParams {
  page: number;
  limit: number;
  filters: SalesOrderFilter;
}

export interface SalesOrderListResult {
  data: (SalesOrder & { customerName: string })[];
  meta: PaginationMeta;
}

export class SalesOrderService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: SalesOrderListParams): Promise<SalesOrderListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(salesOrders.tenantId, this.tenantId),
      filters.status ? eq(salesOrders.status, filters.status) : undefined,
      filters.customerId ? eq(salesOrders.customerId, filters.customerId) : undefined,
      filters.dateFrom ? gte(salesOrders.orderDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(salesOrders.orderDate, filters.dateTo) : undefined,
      filters.search ? ilike(salesOrders.orderNumber, `%${filters.search}%`) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ order: salesOrders, customerName: customers.name })
        .from(salesOrders)
        .innerJoin(customers, eq(salesOrders.customerId, customers.id))
        .where(baseWhere)
        .orderBy(sql`${salesOrders.createdAt} desc`)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(salesOrders).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({ ...this.toOrder(r.order), customerName: r.customerName })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<SalesOrderWithDetails> {
    const [row] = await this.db
      .select({ order: salesOrders, customerName: customers.name })
      .from(salesOrders)
      .innerJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Sales Order');

    const itemRows = await this.db
      .select()
      .from(salesOrderItems)
      .where(and(eq(salesOrderItems.orderId, id), eq(salesOrderItems.tenantId, this.tenantId)));

    return {
      ...this.toOrder(row.order),
      customerName: row.customerName,
      items: itemRows.map((i) => this.toOrderItem(i)),
    };
  }

  async create(input: CreateSalesOrderInput, userId: string): Promise<SalesOrderWithDetails> {
    const orderNumber = await this.generateOrderNumber();

    const [order] = await this.db
      .insert(salesOrders)
      .values({
        tenantId: this.tenantId,
        customerId: input.customerId,
        orderNumber,
        orderDate: input.orderDate,
        subtotal: input.subtotal.toString(),
        taxAmount: input.taxAmount.toString(),
        totalAmount: input.totalAmount.toString(),
        notes: input.notes ?? null,
        quoteId: input.quoteId ?? null,
        createdBy: userId,
      })
      .returning();

    const itemValues = input.items.map((item) => ({
      tenantId: this.tenantId,
      orderId: order!.id,
      itemId: item.itemId ?? null,
      description: item.description,
      hsnSacCode: item.hsnSacCode ?? null,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      amount: item.amount.toString(),
      taxRate: item.taxRate?.toString() ?? null,
      taxAmount: ((item.amount * (item.taxRate ?? 0)) / 100).toFixed(2),
    }));

    await this.db.insert(salesOrderItems).values(itemValues);
    return this.getById(order!.id);
  }

  async update(id: string, input: UpdateSalesOrderInput): Promise<SalesOrderWithDetails> {
    const existing = await this.getById(id);
    if (existing.status !== 'draft') {
      throw new ConflictError('Only draft sales orders can be updated');
    }

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.customerId !== undefined) set.customerId = input.customerId;
    if (input.orderDate !== undefined) set.orderDate = input.orderDate;
    if (input.subtotal !== undefined) set.subtotal = input.subtotal.toString();
    if (input.taxAmount !== undefined) set.taxAmount = input.taxAmount.toString();
    if (input.totalAmount !== undefined) set.totalAmount = input.totalAmount.toString();
    if (input.notes !== undefined) set.notes = input.notes ?? null;

    await this.db.update(salesOrders).set(set)
      .where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, this.tenantId)));

    if (input.items) {
      await this.db.delete(salesOrderItems)
        .where(and(eq(salesOrderItems.orderId, id), eq(salesOrderItems.tenantId, this.tenantId)));

      const itemValues = input.items.map((item) => ({
        tenantId: this.tenantId,
        orderId: id,
        itemId: item.itemId ?? null,
        description: item.description!,
        hsnSacCode: item.hsnSacCode ?? null,
        quantity: item.quantity!.toString(),
        unitPrice: item.unitPrice!.toString(),
        amount: item.amount!.toString(),
        taxRate: item.taxRate?.toString() ?? null,
        taxAmount: ((item.amount! * (item.taxRate ?? 0)) / 100).toFixed(2),
      }));

      await this.db.insert(salesOrderItems).values(itemValues);
    }

    return this.getById(id);
  }

  async updateStatus(id: string, status: SalesOrderStatus): Promise<SalesOrder> {
    const [row] = await this.db
      .update(salesOrders)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Sales Order');
    return this.toOrder(row);
  }

  async convertToInvoice(id: string): Promise<{ invoiceId: string }> {
    const order = await this.getById(id);
    if (order.status === 'cancelled') throw new ConflictError('Cannot invoice a cancelled order');
    if (order.status === 'fully_invoiced') throw new ConflictError('Order already fully invoiced');

    const today = new Date().toISOString().split('T')[0]!;
    const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]!;

    const [invoice] = await this.db
      .insert(salesInvoices)
      .values({
        tenantId: this.tenantId,
        customerId: order.customerId,
        invoiceNumber: `INV-FROM-${order.orderNumber}`,
        invoiceDate: today,
        dueDate,
        subtotal: order.subtotal.toString(),
        taxAmount: order.taxAmount.toString(),
        totalAmount: order.totalAmount.toString(),
        balanceDue: order.totalAmount.toString(),
      })
      .returning();

    const invoiceItems = order.items.map((item) => ({
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

    // Update quantityInvoiced on order items
    for (const item of order.items) {
      await this.db.update(salesOrderItems)
        .set({ quantityInvoiced: item.quantity.toString() })
        .where(eq(salesOrderItems.id, item.id));
    }

    // Check if fully invoiced
    const newStatus: SalesOrderStatus = 'fully_invoiced';
    await this.db.update(salesOrders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(salesOrders.id, id));

    return { invoiceId: invoice!.id };
  }

  private async generateOrderNumber(): Promise<string> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesOrders)
      .where(eq(salesOrders.tenantId, this.tenantId));

    const seq = (result?.count ?? 0) + 1;
    return `SO-${seq.toString().padStart(4, '0')}`;
  }

  private toOrder(row: typeof salesOrders.$inferSelect): SalesOrder {
    return {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate,
      subtotal: toNumber(row.subtotal),
      taxAmount: toNumber(row.taxAmount),
      totalAmount: toNumber(row.totalAmount),
      status: row.status,
      notes: row.notes,
      quoteId: row.quoteId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toOrderItem(row: typeof salesOrderItems.$inferSelect): SalesOrderItem {
    return {
      id: row.id,
      tenantId: row.tenantId,
      orderId: row.orderId,
      itemId: row.itemId,
      description: row.description,
      hsnSacCode: row.hsnSacCode,
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unitPrice),
      amount: toNumber(row.amount),
      taxRate: row.taxRate ? toNumber(row.taxRate) : null,
      taxAmount: toNumber(row.taxAmount),
      quantityInvoiced: toNumber(row.quantityInvoiced),
    };
  }
}

import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { paymentReceipts, receiptAllocations, salesInvoices, customers } from '@runq/db';
import type { Db } from '@runq/db';
import type { PaymentReceipt, ReceiptAllocation } from '@runq/types';
import type { CreateReceiptInput, ReceiptFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { decimalAdd, decimalSubtract, decimalLte, decimalGt, toNumber } from '../../utils/decimal';
import { GLService } from '../gl/gl.service';
import { sendEmail } from '../../utils/email';
import { receiptConfirmation } from '../../utils/email-templates';
import { getTenantName } from '../../utils/tenant-name';

export interface ReceiptListParams {
  page: number;
  limit: number;
  filters: ReceiptFilter;
}

export interface ReceiptListResult {
  data: (PaymentReceipt & { customerName: string })[];
  meta: PaginationMeta;
}

export interface ReceiptWithAllocations extends PaymentReceipt {
  customerName: string;
  allocations: (ReceiptAllocation & { invoiceNumber: string; invoiceTotal: number; invoiceBalanceDue: number })[];
}

export class ReceiptService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: ReceiptListParams): Promise<ReceiptListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(paymentReceipts.tenantId, this.tenantId),
      filters.customerId ? eq(paymentReceipts.customerId, filters.customerId) : undefined,
      filters.bankAccountId ? eq(paymentReceipts.bankAccountId, filters.bankAccountId) : undefined,
      filters.dateFrom ? gte(paymentReceipts.receiptDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(paymentReceipts.receiptDate, filters.dateTo) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ receipt: paymentReceipts, customerName: customers.name })
        .from(paymentReceipts)
        .innerJoin(customers, eq(paymentReceipts.customerId, customers.id))
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(paymentReceipts).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({ ...this.toReceipt(r.receipt), customerName: r.customerName })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<ReceiptWithAllocations> {
    const [row] = await this.db
      .select({ receipt: paymentReceipts, customerName: customers.name })
      .from(paymentReceipts)
      .innerJoin(customers, eq(paymentReceipts.customerId, customers.id))
      .where(and(eq(paymentReceipts.id, id), eq(paymentReceipts.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Receipt');

    const allocRows = await this.db
      .select({
        id: receiptAllocations.id,
        tenantId: receiptAllocations.tenantId,
        receiptId: receiptAllocations.receiptId,
        invoiceId: receiptAllocations.invoiceId,
        amount: receiptAllocations.amount,
        createdAt: receiptAllocations.createdAt,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceTotal: salesInvoices.totalAmount,
        invoiceBalanceDue: salesInvoices.balanceDue,
      })
      .from(receiptAllocations)
      .innerJoin(salesInvoices, eq(receiptAllocations.invoiceId, salesInvoices.id))
      .where(eq(receiptAllocations.receiptId, id));

    return {
      ...this.toReceipt(row.receipt),
      customerName: row.customerName,
      allocations: allocRows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        receiptId: r.receiptId,
        invoiceId: r.invoiceId,
        amount: toNumber(r.amount),
        createdAt: r.createdAt.toISOString(),
        invoiceNumber: r.invoiceNumber,
        invoiceTotal: toNumber(r.invoiceTotal),
        invoiceBalanceDue: toNumber(r.invoiceBalanceDue),
      })),
    };
  }

  async create(input: CreateReceiptInput): Promise<ReceiptWithAllocations> {
    const invoiceIds = input.allocations.map((a) => a.invoiceId);
    const invoiceRows = await this.fetchAndValidateInvoices(invoiceIds, input.allocations, input.totalAmount);

    const result = await this.db.transaction(async (tx) => {
      // Lock all target invoices to prevent concurrent balance corruption
      const invoiceIds = input.allocations.map((a) => a.invoiceId);
      for (const invId of invoiceIds) {
        await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invId} FOR UPDATE`);
      }

      const [receipt] = await tx
        .insert(paymentReceipts)
        .values({
          tenantId: this.tenantId,
          customerId: input.customerId,
          bankAccountId: input.bankAccountId,
          receiptDate: input.receiptDate,
          amount: input.totalAmount.toString(),
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      await tx.insert(receiptAllocations).values(
        input.allocations.map((a) => ({
          tenantId: this.tenantId,
          receiptId: receipt!.id,
          invoiceId: a.invoiceId,
          amount: a.amount.toString(),
        })),
      );

      for (const alloc of input.allocations) {
        const inv = invoiceRows.find((r) => r.id === alloc.invoiceId)!;
        const newAmountReceived = decimalAdd(inv.amountReceived, alloc.amount);
        const newBalanceDue = decimalSubtract(inv.balanceDue, alloc.amount);
        const newStatus = decimalLte(newBalanceDue, '0') ? 'paid' : 'partially_paid';

        await tx
          .update(salesInvoices)
          .set({
            amountReceived: newAmountReceived,
            balanceDue: newBalanceDue,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(salesInvoices.id, alloc.invoiceId));
      }

      return receipt!;
    });

    const receiptWithAllocations = await this.getById(result.id);

    // Post to GL
    const gl = new GLService(this.db, this.tenantId);
    void gl.postReceipt({
      amount: receiptWithAllocations.amount,
      date: receiptWithAllocations.receiptDate,
      id: receiptWithAllocations.id,
      customerName: receiptWithAllocations.customerName,
    });

    void this.sendReceiptEmail(receiptWithAllocations);
    return receiptWithAllocations;
  }

  private async sendReceiptEmail(receipt: ReceiptWithAllocations): Promise<void> {
    const [customerRow] = await this.db
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, receipt.customerId))
      .limit(1);

    if (!customerRow?.email) return;

    const firstAlloc = receipt.allocations[0];
    const invoiceNumber = firstAlloc?.invoiceNumber ?? 'N/A';
    const balance = firstAlloc?.invoiceBalanceDue ?? 0;

    const companyName = await getTenantName(this.db, this.tenantId);
    const template = receiptConfirmation({
      customerName: receipt.customerName,
      amount: receipt.amount,
      invoiceNumber,
      ref: receipt.referenceNumber ?? receipt.id,
      balance,
      companyName,
    });

    sendEmail({ to: customerRow.email, fromName: companyName, ...template }).catch((err) =>
      console.error('Receipt email failed:', err),
    );
  }

  private async fetchAndValidateInvoices(
    invoiceIds: string[],
    allocations: { invoiceId: string; amount: number }[],
    totalAmount: number,
  ) {
    const rows = await this.db
      .select()
      .from(salesInvoices)
      .where(and(eq(salesInvoices.tenantId, this.tenantId), inArray(salesInvoices.id, invoiceIds)));

    for (const inv of rows) {
      if (inv.status !== 'sent' && inv.status !== 'partially_paid') {
        throw new ConflictError(`Invoice ${inv.invoiceNumber} must be sent or partially paid`);
      }
    }

    for (const alloc of allocations) {
      const inv = rows.find((r) => r.id === alloc.invoiceId);
      if (!inv) throw new NotFoundError(`Invoice ${alloc.invoiceId}`);
      if (decimalGt(alloc.amount, inv.balanceDue)) {
        throw new ConflictError(`Allocation amount exceeds balance due for invoice ${inv.invoiceNumber}`);
      }
    }

    const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(allocSum - totalAmount) > 0.01) {
      throw new ConflictError('Sum of allocations must equal total receipt amount');
    }

    return rows;
  }

  private toReceipt(row: typeof paymentReceipts.$inferSelect): PaymentReceipt {
    return {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      bankAccountId: row.bankAccountId,
      receiptDate: row.receiptDate,
      amount: toNumber(row.amount),
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

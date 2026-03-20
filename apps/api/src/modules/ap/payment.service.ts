import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { payments, paymentAllocations, advancePayments, advanceAdjustments, purchaseInvoices, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { VendorPayment, VendorPaymentWithAllocations, AdvancePayment } from '@runq/types';
import type { CreateVendorPaymentInput, CreateAdvancePaymentInput } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface PaymentListParams {
  page: number;
  limit: number;
  vendorId?: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaymentListResult {
  data: VendorPayment[];
  meta: PaginationMeta;
}

export class PaymentService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: PaymentListParams): Promise<PaymentListResult> {
    const { page, limit, vendorId, bankAccountId, dateFrom, dateTo } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(payments.tenantId, this.tenantId),
      vendorId ? eq(payments.vendorId, vendorId) : undefined,
      bankAccountId ? eq(payments.bankAccountId, bankAccountId) : undefined,
      dateFrom ? gte(payments.paymentDate, dateFrom) : undefined,
      dateTo ? lte(payments.paymentDate, dateTo) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db.select().from(payments).where(baseWhere).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(payments).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toPayment(r)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<VendorPaymentWithAllocations> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.tenantId, this.tenantId)))
      .limit(1);

    if (!payment) throw new NotFoundError('Payment');

    const [vendorRow] = await this.db
      .select({ name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, payment.vendorId))
      .limit(1);

    const allocRows = await this.db
      .select({
        id: paymentAllocations.id,
        tenantId: paymentAllocations.tenantId,
        paymentId: paymentAllocations.paymentId,
        invoiceId: paymentAllocations.invoiceId,
        amount: paymentAllocations.amount,
        createdAt: paymentAllocations.createdAt,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceTotal: purchaseInvoices.totalAmount,
        invoiceBalanceDue: purchaseInvoices.balanceDue,
      })
      .from(paymentAllocations)
      .innerJoin(purchaseInvoices, eq(paymentAllocations.invoiceId, purchaseInvoices.id))
      .where(eq(paymentAllocations.paymentId, id));

    return {
      ...this.toPayment(payment),
      vendorName: vendorRow?.name ?? '',
      allocations: allocRows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        paymentId: r.paymentId,
        invoiceId: r.invoiceId,
        amount: parseFloat(r.amount),
        createdAt: r.createdAt.toISOString(),
        invoiceNumber: r.invoiceNumber,
        invoiceTotal: parseFloat(r.invoiceTotal),
        invoiceBalanceDue: parseFloat(r.invoiceBalanceDue),
      })),
    };
  }

  async createPayment(input: CreateVendorPaymentInput): Promise<VendorPaymentWithAllocations> {
    const invoiceIds = input.allocations.map((a) => a.invoiceId);
    const invoiceRows = await this.fetchAndValidateInvoices(invoiceIds, input.allocations, input.totalAmount);

    const result = await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: this.tenantId,
          vendorId: input.vendorId,
          bankAccountId: input.bankAccountId,
          paymentDate: input.paymentDate,
          amount: input.totalAmount.toString(),
          paymentMethod: input.paymentMethod,
          utrNumber: input.referenceNumber ?? null,
          status: 'completed',
          notes: input.notes ?? null,
        })
        .returning();

      await tx.insert(paymentAllocations).values(
        input.allocations.map((a) => ({
          tenantId: this.tenantId,
          paymentId: payment!.id,
          invoiceId: a.invoiceId,
          amount: a.amount.toString(),
        })),
      );

      for (const alloc of input.allocations) {
        const inv = invoiceRows.find((r) => r.id === alloc.invoiceId)!;
        const newAmountPaid = parseFloat(inv.amountPaid) + alloc.amount;
        const newBalanceDue = parseFloat(inv.balanceDue) - alloc.amount;
        const newStatus = newBalanceDue <= 0 ? 'paid' : 'partially_paid';

        await tx
          .update(purchaseInvoices)
          .set({
            amountPaid: newAmountPaid.toString(),
            balanceDue: newBalanceDue.toString(),
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(purchaseInvoices.id, alloc.invoiceId));
      }

      return payment!;
    });

    return this.getById(result.id);
  }

  async createAdvancePayment(input: CreateAdvancePaymentInput): Promise<AdvancePayment> {
    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: this.tenantId,
          vendorId: input.vendorId,
          bankAccountId: input.bankAccountId,
          paymentDate: input.paymentDate,
          amount: input.amount.toString(),
          paymentMethod: input.paymentMethod,
          utrNumber: input.referenceNumber ?? null,
          status: 'completed',
          notes: input.notes ?? null,
        })
        .returning();

      const [advance] = await tx
        .insert(advancePayments)
        .values({
          tenantId: this.tenantId,
          vendorId: input.vendorId,
          paymentId: payment!.id,
          amount: input.amount.toString(),
          balance: input.amount.toString(),
          advanceDate: input.paymentDate,
          notes: input.notes ?? null,
        })
        .returning();

      return this.toAdvancePayment(advance!);
    });
  }

  async adjustAdvance(advanceId: string, invoiceId: string, amount: number): Promise<void> {
    const { advance, invoice } = await this.fetchAndValidateAdjustment(advanceId, invoiceId, amount);
    const advanceBalance = parseFloat(advance.balance);
    const invoiceBalance = parseFloat(invoice.balanceDue);

    await this.db.transaction(async (tx) => {
      await tx.insert(advanceAdjustments).values({
        tenantId: this.tenantId,
        advanceId,
        invoiceId,
        amount: amount.toString(),
      });

      await tx
        .update(advancePayments)
        .set({ balance: (advanceBalance - amount).toString(), updatedAt: new Date() })
        .where(eq(advancePayments.id, advanceId));

      const newAmountPaid = parseFloat(invoice.amountPaid) + amount;
      const newBalanceDue = invoiceBalance - amount;
      const newStatus = newBalanceDue <= 0 ? 'paid' : 'partially_paid';

      await tx
        .update(purchaseInvoices)
        .set({
          amountPaid: newAmountPaid.toString(),
          balanceDue: newBalanceDue.toString(),
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(purchaseInvoices.id, invoiceId));
    });
  }

  private async fetchAndValidateAdjustment(advanceId: string, invoiceId: string, amount: number) {
    const [advance] = await this.db
      .select()
      .from(advancePayments)
      .where(and(eq(advancePayments.id, advanceId), eq(advancePayments.tenantId, this.tenantId)))
      .limit(1);

    if (!advance) throw new NotFoundError('Advance payment');

    const [invoice] = await this.db
      .select()
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!invoice) throw new NotFoundError('Invoice');

    if (amount > parseFloat(advance.balance)) throw new ConflictError('Adjustment amount exceeds advance balance');
    if (amount > parseFloat(invoice.balanceDue)) throw new ConflictError('Adjustment amount exceeds invoice balance due');
    if (invoice.status !== 'approved' && invoice.status !== 'partially_paid') {
      throw new ConflictError('Invoice must be approved or partially paid');
    }

    return { advance, invoice };
  }

  private async fetchAndValidateInvoices(
    invoiceIds: string[],
    allocations: { invoiceId: string; amount: number }[],
    totalAmount: number,
  ) {
    const rows = await this.db
      .select()
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.tenantId, this.tenantId), inArray(purchaseInvoices.id, invoiceIds)));

    for (const inv of rows) {
      if (inv.status !== 'approved' && inv.status !== 'partially_paid') {
        throw new ConflictError(`Invoice ${inv.invoiceNumber} must be approved or partially paid`);
      }
    }

    for (const alloc of allocations) {
      const inv = rows.find((r) => r.id === alloc.invoiceId);
      if (!inv) throw new NotFoundError(`Invoice ${alloc.invoiceId}`);
      if (alloc.amount > parseFloat(inv.balanceDue)) {
        throw new ConflictError(`Allocation amount exceeds balance due for invoice ${inv.invoiceNumber}`);
      }
    }

    const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
    const diff = Math.abs(allocSum - totalAmount);
    if (diff > 0.01) throw new ConflictError('Sum of allocations must equal total payment amount');

    return rows;
  }

  private toPayment(row: typeof payments.$inferSelect): VendorPayment {
    return {
      id: row.id,
      tenantId: row.tenantId,
      vendorId: row.vendorId,
      bankAccountId: row.bankAccountId,
      paymentDate: row.paymentDate,
      amount: parseFloat(row.amount),
      paymentMethod: row.paymentMethod,
      utrNumber: row.utrNumber,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toAdvancePayment(row: typeof advancePayments.$inferSelect): AdvancePayment {
    return {
      id: row.id,
      tenantId: row.tenantId,
      vendorId: row.vendorId,
      paymentId: row.paymentId,
      amount: parseFloat(row.amount),
      balance: parseFloat(row.balance),
      advanceDate: row.advanceDate,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

import { eq, and, gte, lte, sql, inArray, desc } from 'drizzle-orm';
import { paymentReceipts, receiptAllocations, salesInvoices, customers } from '@runq/db';
import type { Db } from '@runq/db';
import type { PaymentReceipt, ReceiptAllocation } from '@runq/types';
import type { CreateReceiptInput, ReceiptFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { decimalAdd, decimalSubtract, decimalLte, decimalGt, toNumber } from '../../utils/decimal';
import { GLService } from '../gl/gl.service';
import { PaymentClaimService } from './payment-claim.service';
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
  allocations: (ReceiptAllocation & { invoiceNumber: string; invoiceTotal: number; invoiceBalanceDue: number; invoiceStatus: string })[];
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
      filters.search ? sql`(${customers.name} ILIKE ${'%' + filters.search + '%'} OR ${paymentReceipts.referenceNumber} ILIKE ${'%' + filters.search + '%'})` : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ receipt: paymentReceipts, customerName: customers.name })
        .from(paymentReceipts)
        .innerJoin(customers, eq(paymentReceipts.customerId, customers.id))
        .where(baseWhere)
        .orderBy(desc(paymentReceipts.receiptDate), desc(paymentReceipts.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(paymentReceipts).innerJoin(customers, eq(paymentReceipts.customerId, customers.id)).where(baseWhere),
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
        invoiceStatus: salesInvoices.status,
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
        invoiceStatus: r.invoiceStatus,
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
    await gl.postReceipt({
      amount: receiptWithAllocations.amount,
      date: receiptWithAllocations.receiptDate,
      id: receiptWithAllocations.id,
      customerName: receiptWithAllocations.customerName,
    });

    // Best-effort: auto-verify any pending customer-reported payment claim
    // whose invoice set is fully covered by this receipt. Failure here must
    // not roll back the receipt — log and move on.
    try {
      const claimService = new PaymentClaimService(this.db, this.tenantId);
      await claimService.tryAutoResolveClaim(receiptWithAllocations.customerId, {
        id: receiptWithAllocations.id,
        totalAmount: receiptWithAllocations.amount,
        allocations: receiptWithAllocations.allocations.map((a) => ({ invoiceId: a.invoiceId })),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[receipt.create] auto-resolve claim failed', err);
    }

    void this.sendReceiptEmail(receiptWithAllocations);
    return receiptWithAllocations;
  }

  /**
   * Replace a receipt's allocation set with an explicit one (remittance-advice
   * driven). Applies the per-invoice DELTA (new − old) to amount_received so
   * credit-note and other-receipt contributions to the same invoices are
   * preserved. Sum of lines may be ≤ receipt amount; any shortfall stays
   * on-account. Returns the refreshed receipt.
   */
  async reallocate(receiptId: string, lines: { invoiceId: string; amount: number }[]): Promise<ReceiptWithAllocations> {
    const receipt = await this.getById(receiptId); // throws NotFound; gives current allocations
    const oldByInv = new Map(receipt.allocations.map((a) => [a.invoiceId, a.amount]));
    const newByInv = await this.validateReallocation(receipt, lines, oldByInv);

    await this.db.transaction(async (tx) => {
      const affected = new Set<string>([...oldByInv.keys(), ...newByInv.keys()]);
      for (const invId of affected) {
        await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invId} FOR UPDATE`);
      }

      await tx.delete(receiptAllocations).where(eq(receiptAllocations.receiptId, receiptId));
      if (lines.length > 0) {
        await tx.insert(receiptAllocations).values(lines.map((l) => ({
          tenantId: this.tenantId, receiptId, invoiceId: l.invoiceId, amount: l.amount.toFixed(2),
        })));
      }

      for (const invId of affected) {
        const delta = (newByInv.get(invId) ?? 0) - (oldByInv.get(invId) ?? 0);
        await tx.execute(sql`
          UPDATE sales_invoices SET
            amount_received = ROUND(amount_received::numeric + ${delta}, 2),
            balance_due     = GREATEST(0, ROUND(total_amount::numeric - (amount_received::numeric + ${delta}), 2)),
            status = CASE
              WHEN total_amount::numeric - (amount_received::numeric + ${delta}) <= 0.005 THEN 'paid'
              WHEN amount_received::numeric + ${delta} > 0.005 THEN 'partially_paid'
              ELSE 'sent' END::sales_invoice_status,
            updated_at = NOW()
          WHERE id = ${invId} AND tenant_id = ${this.tenantId}`);
      }
    });

    return this.getById(receiptId);
  }

  /** Validate explicit allocation lines against the receipt and invoice headroom. */
  private async validateReallocation(
    receipt: ReceiptWithAllocations,
    lines: { invoiceId: string; amount: number }[],
    oldByInv: Map<string, number>,
  ): Promise<Map<string, number>> {
    const newByInv = new Map<string, number>();
    for (const l of lines) {
      if (l.amount <= 0) throw new ConflictError('Allocation amounts must be positive');
      if (newByInv.has(l.invoiceId)) throw new ConflictError('Duplicate invoice in allocation set');
      newByInv.set(l.invoiceId, l.amount);
    }

    const sum = lines.reduce((s, l) => s + l.amount, 0);
    if (sum - receipt.amount > 0.01) {
      throw new ConflictError(`Allocations (₹${sum.toFixed(2)}) exceed receipt amount (₹${receipt.amount.toFixed(2)})`);
    }

    const ids = [...newByInv.keys()];
    const invs = ids.length === 0 ? [] : await this.db
      .select({ id: salesInvoices.id, number: salesInvoices.invoiceNumber, total: salesInvoices.totalAmount, balanceDue: salesInvoices.balanceDue, customerId: salesInvoices.customerId })
      .from(salesInvoices)
      .where(and(eq(salesInvoices.tenantId, this.tenantId), inArray(salesInvoices.id, ids)));
    const invById = new Map(invs.map((i) => [i.id, i]));

    for (const [invId, amount] of newByInv) {
      const inv = invById.get(invId);
      if (!inv) throw new NotFoundError(`Invoice ${invId}`);
      if (inv.customerId !== receipt.customerId) throw new ConflictError(`Invoice ${inv.number} belongs to a different customer`);
      // Headroom = current balance + whatever this receipt already put on it
      // (that prior allocation is about to be removed).
      const headroom = toNumber(inv.balanceDue) + (oldByInv.get(invId) ?? 0);
      if (amount - headroom > 0.01) {
        throw new ConflictError(`Allocation ₹${amount.toFixed(2)} exceeds available ₹${headroom.toFixed(2)} on invoice ${inv.number}`);
      }
    }
    return newByInv;
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
      isOnAccount: row.isOnAccount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

import { eq, and, gte, lte, sql, inArray, ilike, desc } from 'drizzle-orm';
import { payments, paymentAllocations, advancePayments, advanceAdjustments, purchaseInvoices, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { VendorPayment, VendorPaymentWithAllocations, AdvancePayment, BatchPaymentResult, BatchImportResult } from '@runq/types';
import type { CreateVendorPaymentInput, CreateAdvancePaymentInput, CreateDirectPaymentInput, CreateBatchPaymentInput } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { decimalAdd, decimalSubtract, decimalLte, decimalGt, toNumber } from '../../utils/decimal';
import { AuditService } from '../../utils/audit';
import { sendEmail } from '../../utils/email';
import { getTenantName } from '../../utils/tenant-name';
import { paymentConfirmation } from '../../utils/email-templates';

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

  private audit(): AuditService {
    return new AuditService(this.db, this.tenantId);
  }

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
      this.db
        .select({
          id: payments.id, tenantId: payments.tenantId, vendorId: payments.vendorId,
          bankAccountId: payments.bankAccountId, paymentDate: payments.paymentDate,
          amount: payments.amount, paymentMethod: payments.paymentMethod,
          utrNumber: payments.utrNumber, status: payments.status, notes: payments.notes,
          approvedBy: payments.approvedBy, approvedAt: payments.approvedAt,
          createdAt: payments.createdAt, updatedAt: payments.updatedAt,
          vendorName: vendors.name, vendorCategory: vendors.category,
        })
        .from(payments)
        .innerJoin(vendors, eq(payments.vendorId, vendors.id))
        .where(baseWhere)
        .orderBy(desc(payments.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(payments).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({
        ...this.toPayment(r),
        vendorName: r.vendorName,
        vendorCategory: r.vendorCategory ?? null,
      })),
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
        amount: toNumber(r.amount),
        createdAt: r.createdAt.toISOString(),
        invoiceNumber: r.invoiceNumber,
        invoiceTotal: toNumber(r.invoiceTotal),
        invoiceBalanceDue: toNumber(r.invoiceBalanceDue),
      })),
    };
  }

  async createPayment(input: CreateVendorPaymentInput, userId?: string): Promise<VendorPaymentWithAllocations> {
    const invoiceIds = input.allocations.map((a) => a.invoiceId);
    const invoiceRows = await this.fetchAndValidateInvoices(invoiceIds, input.allocations, input.totalAmount);

    const result = await this.db.transaction(async (tx) => {
      // Lock all target invoices to prevent concurrent balance corruption
      const invoiceIds = input.allocations.map((a) => a.invoiceId);
      await tx.execute(sql`SELECT id FROM purchase_invoices WHERE id = ANY(${invoiceIds}) FOR UPDATE`);

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
          status: 'pending',
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
        const newAmountPaid = decimalAdd(inv.amountPaid, alloc.amount);
        const newBalanceDue = decimalSubtract(inv.balanceDue, alloc.amount);
        const newStatus = decimalLte(newBalanceDue, '0') ? 'paid' : 'partially_paid';

        await tx
          .update(purchaseInvoices)
          .set({
            amountPaid: newAmountPaid,
            balanceDue: newBalanceDue,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(purchaseInvoices.id, alloc.invoiceId));
      }

      return payment!;
    });

    await this.audit().log({ userId, action: 'created', entityType: 'payment', entityId: result.id });
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
          status: 'pending',
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

  async createDirectPayment(input: CreateDirectPaymentInput): Promise<VendorPayment> {
    const [payment] = await this.db
      .insert(payments)
      .values({
        tenantId: this.tenantId,
        vendorId: input.vendorId,
        bankAccountId: input.bankAccountId,
        paymentDate: input.paymentDate,
        amount: input.amount.toString(),
        paymentMethod: input.paymentMethod,
        utrNumber: input.referenceNumber ?? null,
        status: 'pending',
        notes: input.notes ?? null,
      })
      .returning();

    return this.toPayment(payment!);
  }

  async createBatch(input: CreateBatchPaymentInput): Promise<BatchPaymentResult> {
    const created = await this.db.transaction(async (tx) => {
      const results: (typeof payments.$inferSelect)[] = [];
      for (const item of input.payments) {
        const [payment] = await tx
          .insert(payments)
          .values({
            tenantId: this.tenantId,
            vendorId: item.vendorId,
            bankAccountId: input.bankAccountId,
            paymentDate: input.paymentDate,
            amount: item.amount.toString(),
            paymentMethod: input.paymentMethod,
            utrNumber: item.referenceNumber ?? null,
            status: 'pending',
            notes: item.notes ?? input.description ?? null,
          })
          .returning();
        results.push(payment!);
      }
      return results;
    });

    const paymentRows = created.map((r) => this.toPayment(r));
    const totalAmount = paymentRows.reduce((sum, p) => sum + p.amount, 0);
    return { created: paymentRows.length, totalAmount, payments: paymentRows };
  }

  async approvePayment(paymentId: string, approvedBy: string): Promise<VendorPayment> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, this.tenantId)))
      .limit(1);

    if (!payment) throw new NotFoundError('Payment');
    if (payment.status !== 'pending') throw new ConflictError('Only pending payments can be approved');

    const [updated] = await this.db
      .update(payments)
      .set({ status: 'completed', approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, this.tenantId)))
      .returning();

    await this.audit().log({ userId: approvedBy, action: 'approved', entityType: 'payment', entityId: paymentId });

    const result = this.toPayment(updated!);
    void this.sendPaymentConfirmationEmail(result, payment.vendorId);
    return result;
  }

  async rejectPayment(paymentId: string, rejectedBy: string, reason?: string): Promise<void> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, this.tenantId)))
      .limit(1);

    if (!payment) throw new NotFoundError('Payment');
    if (payment.status !== 'pending') throw new ConflictError('Only pending payments can be rejected');

    await this.db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(and(eq(payments.id, paymentId), eq(payments.tenantId, this.tenantId)));

      const allocs = await tx
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));

      for (const alloc of allocs) {
        const [inv] = await tx
          .select()
          .from(purchaseInvoices)
          .where(eq(purchaseInvoices.id, alloc.invoiceId))
          .limit(1);

        if (!inv) continue;

        const allocAmount = parseFloat(alloc.amount);
        const newAmountPaid = Math.max(0, parseFloat(inv.amountPaid) - allocAmount);
        const newBalanceDue = parseFloat(inv.balanceDue) + allocAmount;
        const newStatus = newAmountPaid <= 0 ? 'approved' : 'partially_paid';

        await tx
          .update(purchaseInvoices)
          .set({ amountPaid: newAmountPaid.toString(), balanceDue: newBalanceDue.toString(), status: newStatus, updatedAt: new Date() })
          .where(eq(purchaseInvoices.id, alloc.invoiceId));
      }
    });

    await this.audit().log({
      userId: rejectedBy,
      action: 'rejected',
      entityType: 'payment',
      entityId: paymentId,
      metadata: reason ? { reason } : undefined,
    });
  }

  async exportPaymentsCSV(filters: { status?: string; dateFrom?: string; dateTo?: string }): Promise<string> {
    const { status, dateFrom, dateTo } = filters;
    const rows = await this.db
      .select({
        id: payments.id,
        paymentDate: payments.paymentDate,
        amount: payments.amount,
        utrNumber: payments.utrNumber,
        paymentMethod: payments.paymentMethod,
        notes: payments.notes,
        vendorName: vendors.name,
        bankAccountName: vendors.bankAccountName,
        bankAccountNumber: vendors.bankAccountNumber,
        bankIfsc: vendors.bankIfsc,
      })
      .from(payments)
      .innerJoin(vendors, eq(payments.vendorId, vendors.id))
      .where(and(
        eq(payments.tenantId, this.tenantId),
        status ? eq(payments.status, status as 'pending' | 'completed' | 'failed' | 'reversed') : undefined,
        dateFrom ? gte(payments.paymentDate, dateFrom) : undefined,
        dateTo ? lte(payments.paymentDate, dateTo) : undefined,
      ));

    return this.buildExportCSV(rows);
  }

  private buildExportCSV(rows: {
    id: string; paymentDate: string; amount: string; utrNumber: string | null;
    paymentMethod: string; notes: string | null; vendorName: string;
    bankAccountName: string | null; bankAccountNumber: string | null; bankIfsc: string | null;
  }[]): string {
    const csvQuote = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = 'Beneficiary Name,Account Number,IFSC Code,Amount,Payment Mode,Reference,Remarks';
    const lines = rows.map((r) => {
      const hasBankDetails = r.bankAccountNumber && r.bankIfsc;
      const remarks = hasBankDetails ? (r.notes ?? 'Payment') : 'MISSING BANK DETAILS';
      return [
        csvQuote(r.bankAccountName ?? r.vendorName),
        csvQuote(r.bankAccountNumber ?? ''),
        csvQuote(r.bankIfsc ?? ''),
        csvQuote(toNumber(r.amount).toFixed(2)),
        csvQuote('NEFT'),
        csvQuote(r.utrNumber ?? ''),
        csvQuote(remarks),
      ].join(',');
    });
    return [header, ...lines].join('\n');
  }

  async importBatchFromCSV(bankAccountId: string, paymentDate: string, csvData: string): Promise<BatchImportResult> {
    const { rows, parseErrors } = this.parseBatchCSV(csvData);
    const errors: BatchImportResult['errors'] = [...parseErrors];
    let created = 0;
    let totalAmount = 0;
    let skipped = 0;

    const inserted = await this.db.transaction(async (tx) => {
      const insertedRows: (typeof payments.$inferSelect)[] = [];
      for (const row of rows) {
        const [vendor] = await tx
          .select({ id: vendors.id })
          .from(vendors)
          .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, row.vendorName)))
          .limit(1);

        if (!vendor) {
          errors.push({ row: row.rowNum, vendorName: row.vendorName, message: 'Vendor not found' });
          skipped++;
          continue;
        }

        const [payment] = await tx
          .insert(payments)
          .values({
            tenantId: this.tenantId,
            vendorId: vendor.id,
            bankAccountId,
            paymentDate,
            amount: row.amount.toString(),
            paymentMethod: 'bank_transfer',
            utrNumber: row.reference ?? null,
            status: 'pending',
            notes: row.notes ?? null,
          })
          .returning();

        insertedRows.push(payment!);
        created++;
        totalAmount += row.amount;
      }
      return insertedRows;
    });

    void inserted;
    return { created, totalAmount, skipped, errors };
  }

  private parseBatchCSV(csvData: string): {
    rows: { rowNum: number; vendorName: string; amount: number; reference: string | null; notes: string | null }[];
    parseErrors: BatchImportResult['errors'];
  } {
    const lines = csvData.split('\n').map((l) => l.trim()).filter(Boolean);
    const parseErrors: BatchImportResult['errors'] = [];
    const rows: { rowNum: number; vendorName: string; amount: number; reference: string | null; notes: string | null }[] = [];

    if (lines.length < 2) return { rows, parseErrors };

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCSVLine(lines[i]!);
      const vendorName = cols[0]?.trim() ?? '';
      const amountRaw = cols[1]?.trim() ?? '';
      const reference = cols[2]?.trim() || null;
      const notes = cols[3]?.trim() || null;
      const rowNum = i + 1;

      if (!vendorName) { parseErrors.push({ row: rowNum, vendorName: '', message: 'Missing vendor name' }); continue; }
      const amount = parseFloat(amountRaw.replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) { parseErrors.push({ row: rowNum, vendorName, message: `Invalid amount: ${amountRaw}` }); continue; }

      rows.push({ rowNum, vendorName, amount, reference, notes });
    }

    return { rows, parseErrors };
  }

  private splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }

  async adjustAdvance(advanceId: string, invoiceId: string, amount: number): Promise<void> {
    const { advance, invoice } = await this.fetchAndValidateAdjustment(advanceId, invoiceId, amount);

    await this.db.transaction(async (tx) => {
      await tx.insert(advanceAdjustments).values({
        tenantId: this.tenantId,
        advanceId,
        invoiceId,
        amount: amount.toString(),
      });

      await tx
        .update(advancePayments)
        .set({ balance: decimalSubtract(advance.balance, amount), updatedAt: new Date() })
        .where(eq(advancePayments.id, advanceId));

      const newAmountPaid = decimalAdd(invoice.amountPaid, amount);
      const newBalanceDue = decimalSubtract(invoice.balanceDue, amount);
      const newStatus = decimalLte(newBalanceDue, '0') ? 'paid' : 'partially_paid';

      await tx
        .update(purchaseInvoices)
        .set({
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
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

    if (decimalGt(amount, advance.balance)) throw new ConflictError('Adjustment amount exceeds advance balance');
    if (decimalGt(amount, invoice.balanceDue)) throw new ConflictError('Adjustment amount exceeds invoice balance due');
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
      if (decimalGt(alloc.amount, inv.balanceDue)) {
        throw new ConflictError(`Allocation amount exceeds balance due for invoice ${inv.invoiceNumber}`);
      }
    }

    const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
    const diff = Math.abs(allocSum - totalAmount);
    if (diff > 0.01) throw new ConflictError('Sum of allocations must equal total payment amount');

    return rows;
  }

  private async sendPaymentConfirmationEmail(payment: VendorPayment, vendorId: string): Promise<void> {
    const [vendorRow] = await this.db
      .select({ name: vendors.name, email: vendors.email })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendorRow?.email) return;

    const companyName = await getTenantName(this.db, this.tenantId);
    const template = paymentConfirmation({
      vendorName: vendorRow.name,
      amount: payment.amount,
      utr: payment.utrNumber ?? payment.id,
      date: payment.paymentDate,
      ref: payment.id,
      companyName,
    });

    sendEmail({ to: vendorRow.email, fromName: companyName, ...template }).catch((err) =>
      console.error('Payment confirmation email failed:', err),
    );
  }

  private toPayment(row: typeof payments.$inferSelect): VendorPayment {
    return {
      id: row.id,
      tenantId: row.tenantId,
      vendorId: row.vendorId,
      bankAccountId: row.bankAccountId,
      paymentDate: row.paymentDate,
      amount: toNumber(row.amount),
      paymentMethod: row.paymentMethod,
      utrNumber: row.utrNumber,
      status: row.status,
      notes: row.notes,
      approvedBy: row.approvedBy ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
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
      amount: toNumber(row.amount),
      balance: toNumber(row.balance),
      advanceDate: row.advanceDate,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

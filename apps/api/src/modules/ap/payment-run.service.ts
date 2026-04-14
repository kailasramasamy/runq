import { eq, and, sql, inArray, ilike, desc } from 'drizzle-orm';
import { paymentRuns, paymentRunLines, vendors, payments, paymentAllocations, purchaseInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { PaymentRun, PaymentRunWithLines, PaymentRunLine, ExecuteRunResult } from '@runq/types';
import type { CreatePaymentRunInput, CreateRunFromBillsInput, ApproveLinesInput, RejectLinesInput, PaymentRunFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { sendEmail } from '../../utils/email';
import { batchPaymentSummary } from '../../utils/email-templates';
import { tenants } from '@runq/db';
import { getTenantName } from '../../utils/tenant-name';

export interface RunListParams extends PaymentRunFilter {
  page: number;
  limit: number;
}

export interface RunListResult {
  data: PaymentRun[];
  meta: PaginationMeta;
}

export class PaymentRunService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async createRun(input: CreatePaymentRunInput): Promise<PaymentRunWithLines> {
    const existing = await this.db
      .select({ id: paymentRuns.id })
      .from(paymentRuns)
      .where(and(eq(paymentRuns.tenantId, this.tenantId), eq(paymentRuns.runId, input.runId)))
      .limit(1);

    if (existing.length > 0) throw new ConflictError(`Run '${input.runId}' already exists for this tenant`);

    const matchedLines = await this.matchVendors(input.lines);

    const totalAmount = input.lines.reduce((s, i) => s + i.amount, 0);

    const run = await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(paymentRuns)
        .values({
          tenantId: this.tenantId,
          runId: input.runId,
          source: input.source,
          description: input.description ?? null,
          totalCount: input.lines.length,
          totalAmount: totalAmount.toString(),
        })
        .returning();

      await tx.insert(paymentRunLines).values(
        matchedLines.map((item) => ({
          tenantId: this.tenantId,
          runId: run!.id,
          vendorId: item.vendorId ?? null,
          vendorName: item.vendorName,
          amount: item.amount.toString(),
          reference: item.reference ?? null,
          reason: item.reason ?? null,
          dueDate: item.dueDate ?? null,
          purchaseInvoiceId: item.purchaseInvoiceId ?? null,
        })),
      );

      return run!;
    });

    return this.getRun(run.id);
  }

  async createRunFromBills(input: CreateRunFromBillsInput): Promise<PaymentRunWithLines> {
    // Load the bills, validate they're approved/partially_paid and have a non-zero balance.
    const bills = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        vendorId: purchaseInvoices.vendorId,
        balanceDue: purchaseInvoices.balanceDue,
        dueDate: purchaseInvoices.dueDate,
        status: purchaseInvoices.status,
        vendorName: vendors.name,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(
        and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          inArray(purchaseInvoices.id, input.billIds),
        ),
      );

    if (bills.length === 0) throw new NotFoundError('Bills');
    if (bills.length !== input.billIds.length) {
      throw new NotFoundError('One or more bills not found');
    }

    const ineligible = bills.filter(
      (b) => (b.status !== 'approved' && b.status !== 'partially_paid') || parseFloat(b.balanceDue) <= 0,
    );
    if (ineligible.length > 0) {
      throw new ConflictError(
        `${ineligible.length} bill(s) are not eligible for a pay run (must be approved with balance due).`,
      );
    }

    const totalAmount = bills.reduce((s, b) => s + parseFloat(b.balanceDue), 0);
    const runIdentifier = `RUN-${Date.now()}`;

    const run = await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(paymentRuns)
        .values({
          tenantId: this.tenantId,
          runId: runIdentifier,
          source: 'bills',
          description: input.description ?? `${bills.length} bill(s) selected for payment`,
          totalCount: bills.length,
          totalAmount: totalAmount.toString(),
        })
        .returning();

      await tx.insert(paymentRunLines).values(
        bills.map((b) => ({
          tenantId: this.tenantId,
          runId: run!.id,
          vendorId: b.vendorId,
          vendorName: b.vendorName,
          amount: b.balanceDue,
          reference: b.invoiceNumber,
          reason: `Bill ${b.invoiceNumber}`,
          dueDate: b.dueDate,
          purchaseInvoiceId: b.id,
        })),
      );

      return run!;
    });

    return this.getRun(run.id);
  }

  async listRuns(params: RunListParams): Promise<RunListResult> {
    const { page, limit, status, source } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(paymentRuns.tenantId, this.tenantId),
      status ? eq(paymentRuns.status, status) : undefined,
      source ? ilike(paymentRuns.source, `%${source}%`) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db.select().from(paymentRuns).where(baseWhere).orderBy(desc(paymentRuns.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(paymentRuns).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(this.toRun),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getPaymentQueue(): Promise<{
    summary: { totalPayable: number; overdueAmount: number; overdueCount: number; dueThisWeek: number; dueThisMonth: number };
    bills: { id: string; invoiceNumber: string; vendorId: string; vendorName: string; dueDate: string; totalAmount: number; balanceDue: number; daysOverdue: number; status: string }[];
  }> {
    const today = new Date().toISOString().split('T')[0]!;
    const todayMs = new Date(today).getTime();
    const weekEnd = new Date(todayMs + 7 * 86_400_000).toISOString().split('T')[0]!;
    const monthEnd = new Date(today.slice(0, 7) + '-01');
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    const monthEndStr = monthEnd.toISOString().split('T')[0]!;

    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        vendorId: vendors.id,
        vendorName: vendors.name,
        dueDate: purchaseInvoices.dueDate,
        totalAmount: purchaseInvoices.totalAmount,
        balanceDue: purchaseInvoices.balanceDue,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        sql`${purchaseInvoices.status} IN ('approved', 'partially_paid')`,
        sql`${purchaseInvoices.balanceDue} > 0`,
      ))
      .orderBy(purchaseInvoices.dueDate)
      .limit(500);

    let totalPayable = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    let dueThisWeek = 0;
    let dueThisMonth = 0;

    const bills = rows.map((r) => {
      const bal = parseFloat(r.balanceDue);
      const daysOverdue = Math.max(0, Math.floor((todayMs - new Date(r.dueDate).getTime()) / 86_400_000));
      totalPayable += bal;
      if (r.dueDate < today) { overdueAmount += bal; overdueCount++; }
      if (r.dueDate >= today && r.dueDate <= weekEnd) dueThisWeek += bal;
      if (r.dueDate >= today && r.dueDate <= monthEndStr) dueThisMonth += bal;
      return {
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        dueDate: r.dueDate,
        totalAmount: parseFloat(r.totalAmount),
        balanceDue: bal,
        daysOverdue,
        status: r.status,
      };
    });

    return {
      summary: { totalPayable, overdueAmount, overdueCount, dueThisWeek, dueThisMonth },
      bills,
    };
  }

  async getRun(id: string): Promise<PaymentRunWithLines> {
    const [run] = await this.db
      .select()
      .from(paymentRuns)
      .where(and(eq(paymentRuns.id, id), eq(paymentRuns.tenantId, this.tenantId)))
      .limit(1);

    if (!run) throw new NotFoundError('Payment run');

    const lines = await this.db
      .select()
      .from(paymentRunLines)
      .where(and(eq(paymentRunLines.runId, id), eq(paymentRunLines.tenantId, this.tenantId)))
      .orderBy(paymentRunLines.createdAt);

    return {
      ...this.toRun(run),
      lines: lines.map(this.toLine),
    };
  }

  async approveLines(runId: string, input: ApproveLinesInput): Promise<PaymentRunWithLines> {
    await this.assertRunExists(runId);

    await this.db
      .update(paymentRunLines)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(
        and(
          eq(paymentRunLines.runId, runId),
          eq(paymentRunLines.tenantId, this.tenantId),
          inArray(paymentRunLines.id, input.lineIds),
        ),
      );

    await this.syncRunCounts(runId);
    return this.getRun(runId);
  }

  async rejectLines(runId: string, input: RejectLinesInput): Promise<PaymentRunWithLines> {
    await this.assertRunExists(runId);

    await this.db
      .update(paymentRunLines)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(
        and(
          eq(paymentRunLines.runId, runId),
          eq(paymentRunLines.tenantId, this.tenantId),
          inArray(paymentRunLines.id, input.lineIds),
        ),
      );

    await this.syncRunCounts(runId);
    return this.getRun(runId);
  }

  async executeRun(runId: string, bankAccountId: string): Promise<ExecuteRunResult> {
    const run = await this.assertRunExists(runId);

    if (run.status !== 'approved' && run.status !== 'partially_approved') {
      throw new ConflictError('Run must be approved or partially approved to execute');
    }

    const approvedRows = await this.db
      .select()
      .from(paymentRunLines)
      .where(
        and(
          eq(paymentRunLines.runId, runId),
          eq(paymentRunLines.tenantId, this.tenantId),
          eq(paymentRunLines.status, 'approved'),
        ),
      );

    const result = await this.processApprovedLines(approvedRows, bankAccountId);

    await this.db
      .update(paymentRuns)
      .set({ status: 'executed', updatedAt: new Date() })
      .where(eq(paymentRuns.id, runId));

    void this.sendRunSummaryEmail(approvedRows, result.totalPaid);
    return result;
  }

  async exportRunCSV(runId: string): Promise<string> {
    await this.assertRunExists(runId);

    const rows = await this.db
      .select({
        vendorName: paymentRunLines.vendorName,
        amount: paymentRunLines.amount,
        reference: paymentRunLines.reference,
        reason: paymentRunLines.reason,
        bankAccountName: vendors.bankAccountName,
        bankAccountNumber: vendors.bankAccountNumber,
        bankIfsc: vendors.bankIfsc,
      })
      .from(paymentRunLines)
      .leftJoin(vendors, eq(paymentRunLines.vendorId, vendors.id))
      .where(
        and(
          eq(paymentRunLines.runId, runId),
          eq(paymentRunLines.tenantId, this.tenantId),
          eq(paymentRunLines.status, 'approved'),
        ),
      );

    return this.buildCSV(rows);
  }

  private async matchVendors(
    lines: CreatePaymentRunInput['lines'],
  ): Promise<(CreatePaymentRunInput['lines'][number] & { vendorId?: string | null })[]> {
    const unmatched = lines.filter((i) => !i.vendorId);
    if (unmatched.length === 0) return lines;

    const results = await Promise.all(
      unmatched.map((item) => this.resolveVendorId(item.vendorName)),
    );

    const resolvedMap = new Map(unmatched.map((item, idx) => [item.vendorName, results[idx]]));

    return lines.map((item) => {
      if (item.vendorId) return item;
      return { ...item, vendorId: resolvedMap.get(item.vendorName) ?? null };
    });
  }

  private async resolveVendorId(vendorName: string): Promise<string | null> {
    // Step 1: exact case-insensitive match
    const exact = await this.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, vendorName)))
      .limit(1);
    if (exact.length === 1) return exact[0]!.id;

    // Step 2: contains match — only accept if exactly one result
    const contains = await this.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `%${vendorName}%`)))
      .limit(2);
    if (contains.length === 1) return contains[0]!.id;

    // Step 3: first-word match — only accept if exactly one result
    const firstWord = vendorName.trim().split(/\s+/)[0];
    if (!firstWord || firstWord.length < 2) return null;

    const partial = await this.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `${firstWord}%`)))
      .limit(2);
    if (partial.length === 1) return partial[0]!.id;

    return null;
  }

  private async sendRunSummaryEmail(
    rows: (typeof paymentRunLines.$inferSelect)[],
    totalPaid: number,
  ): Promise<void> {
    const [tenantRow] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    const settings = (tenantRow?.settings ?? {}) as Record<string, unknown>;
    const ownerEmail = (settings['ownerEmail'] as string | undefined) ?? process.env.MAIL_FROM;
    if (!ownerEmail) return;

    const companyName = await getTenantName(this.db, this.tenantId);
    const paidRows = rows.filter((r) => r.vendorId);
    const template = batchPaymentSummary({
      count: paidRows.length,
      totalAmount: totalPaid,
      companyName,
      payments: paidRows.map((r) => ({
        vendorName: r.vendorName,
        amount: parseFloat(r.amount),
        reference: r.reference,
      })),
    });

    sendEmail({ to: ownerEmail, fromName: companyName, ...template }).catch((err) =>
      console.error('Run summary email failed:', err),
    );
  }

  private async processApprovedLines(
    rows: (typeof paymentRunLines.$inferSelect)[],
    bankAccountId: string,
  ): Promise<ExecuteRunResult> {
    let paid = 0;
    let failed = 0;
    let totalPaid = 0;

    for (const row of rows) {
      if (!row.vendorId) {
        await this.db
          .update(paymentRunLines)
          .set({ status: 'failed', errorMessage: 'Vendor not matched — no vendor_id', updatedAt: new Date() })
          .where(eq(paymentRunLines.id, row.id));
        failed++;
        continue;
      }

      // Each line is processed in its own transaction. If a line linked to a
      // bill fails mid-way (e.g. allocation insert), the payment + allocation +
      // bill update either all succeed or all roll back, but other lines in the
      // run keep going.
      try {
        await this.db.transaction(async (tx) => {
          const today = new Date().toISOString().split('T')[0]!;

          // If this line is linked to a bill, lock and validate the bill first.
          if (row.purchaseInvoiceId) {
            await tx.execute(
              sql`SELECT id FROM purchase_invoices WHERE id = ${row.purchaseInvoiceId} FOR UPDATE`,
            );
          }

          const [payment] = await tx
            .insert(payments)
            .values({
              tenantId: this.tenantId,
              vendorId: row.vendorId!,
              bankAccountId,
              paymentDate: today,
              amount: row.amount,
              paymentMethod: 'bank_transfer',
              utrNumber: row.reference ?? null,
              status: 'completed',
              notes: row.reason ?? null,
            })
            .returning();

          // Settle the linked bill: write the allocation row and recalc
          // amountPaid / balanceDue / status.
          if (row.purchaseInvoiceId) {
            const [bill] = await tx
              .select()
              .from(purchaseInvoices)
              .where(eq(purchaseInvoices.id, row.purchaseInvoiceId))
              .limit(1);

            if (!bill) throw new NotFoundError(`Bill ${row.purchaseInvoiceId}`);

            const allocAmount = parseFloat(row.amount);
            const newAmountPaid = parseFloat(bill.amountPaid) + allocAmount;
            const newBalanceDue = parseFloat(bill.balanceDue) - allocAmount;
            const newStatus = newBalanceDue <= 0 ? 'paid' : 'partially_paid';

            await tx.insert(paymentAllocations).values({
              tenantId: this.tenantId,
              paymentId: payment!.id,
              invoiceId: row.purchaseInvoiceId,
              amount: row.amount,
            });

            await tx
              .update(purchaseInvoices)
              .set({
                amountPaid: newAmountPaid.toString(),
                balanceDue: newBalanceDue.toString(),
                status: newStatus,
                updatedAt: new Date(),
              })
              .where(eq(purchaseInvoices.id, row.purchaseInvoiceId));
          }

          await tx
            .update(paymentRunLines)
            .set({ status: 'paid', paymentId: payment!.id, updatedAt: new Date() })
            .where(eq(paymentRunLines.id, row.id));
        });

        paid++;
        totalPaid += parseFloat(row.amount);
      } catch (err) {
        await this.db
          .update(paymentRunLines)
          .set({
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Unknown error during execution',
            updatedAt: new Date(),
          })
          .where(eq(paymentRunLines.id, row.id));
        failed++;
      }
    }

    return { paid, failed, totalPaid };
  }

  private async syncRunCounts(runId: string): Promise<void> {
    const allRows = await this.db
      .select({ status: paymentRunLines.status, amount: paymentRunLines.amount })
      .from(paymentRunLines)
      .where(and(eq(paymentRunLines.runId, runId), eq(paymentRunLines.tenantId, this.tenantId)));

    const approvedRows = allRows.filter((r) => r.status === 'approved');
    const pendingCount = allRows.filter((r) => r.status === 'pending').length;
    const approvedCount = approvedRows.length;
    const approvedAmount = approvedRows.reduce((s, r) => s + parseFloat(r.amount), 0);

    const newStatus = this.deriveRunStatus(approvedCount, pendingCount, allRows.length);

    await this.db
      .update(paymentRuns)
      .set({
        approvedCount,
        approvedAmount: approvedAmount.toString(),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(paymentRuns.id, runId));
  }

  private deriveRunStatus(
    approvedCount: number,
    pendingCount: number,
    totalCount: number,
  ): 'pending_approval' | 'partially_approved' | 'approved' | 'rejected' {
    if (approvedCount === 0 && pendingCount === 0) return 'rejected';
    if (approvedCount === totalCount) return 'approved';
    if (approvedCount > 0) return 'partially_approved';
    return 'pending_approval';
  }

  private async assertRunExists(runId: string): Promise<typeof paymentRuns.$inferSelect> {
    const [run] = await this.db
      .select()
      .from(paymentRuns)
      .where(and(eq(paymentRuns.id, runId), eq(paymentRuns.tenantId, this.tenantId)))
      .limit(1);

    if (!run) throw new NotFoundError('Payment run');
    return run;
  }

  private buildCSV(
    rows: {
      vendorName: string;
      amount: string;
      reference: string | null;
      reason: string | null;
      bankAccountName: string | null | undefined;
      bankAccountNumber: string | null | undefined;
      bankIfsc: string | null | undefined;
    }[],
  ): string {
    const header = 'Beneficiary Name,Account Number,IFSC,Amount,Reference,Remarks';
    const lines = rows.map((r) => {
      const cols = [
        r.bankAccountName ?? r.vendorName,
        r.bankAccountNumber ?? '',
        r.bankIfsc ?? '',
        r.amount,
        r.reference ?? '',
        r.reason ?? '',
      ];
      return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
    });
    return [header, ...lines].join('\n');
  }

  private toRun(row: typeof paymentRuns.$inferSelect): PaymentRun {
    return {
      id: row.id,
      tenantId: row.tenantId,
      runId: row.runId,
      source: row.source,
      description: row.description,
      status: row.status,
      totalCount: row.totalCount,
      totalAmount: parseFloat(row.totalAmount),
      approvedCount: row.approvedCount,
      approvedAmount: parseFloat(row.approvedAmount),
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toLine(row: typeof paymentRunLines.$inferSelect): PaymentRunLine {
    return {
      id: row.id,
      tenantId: row.tenantId,
      runId: row.runId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      amount: parseFloat(row.amount),
      reference: row.reference,
      reason: row.reason,
      dueDate: row.dueDate,
      status: row.status,
      paymentId: row.paymentId,
      purchaseInvoiceId: row.purchaseInvoiceId,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

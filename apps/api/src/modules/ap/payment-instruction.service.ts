import { eq, and, sql, inArray, ilike, desc } from 'drizzle-orm';
import { paymentBatches, paymentInstructions, vendors, payments } from '@runq/db';
import type { Db } from '@runq/db';
import type { PaymentBatch, PaymentBatchWithInstructions, PaymentInstruction, ExecuteBatchResult } from '@runq/types';
import type { CreatePaymentBatchInput, ApproveInstructionsInput, RejectInstructionsInput, PaymentBatchFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { sendEmail } from '../../utils/email';
import { batchPaymentSummary } from '../../utils/email-templates';
import { tenants } from '@runq/db';
import { getTenantName } from '../../utils/tenant-name';

export interface BatchListParams extends PaymentBatchFilter {
  page: number;
  limit: number;
}

export interface BatchListResult {
  data: PaymentBatch[];
  meta: PaginationMeta;
}

export class PaymentInstructionService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async createBatch(input: CreatePaymentBatchInput): Promise<PaymentBatchWithInstructions> {
    const existing = await this.db
      .select({ id: paymentBatches.id })
      .from(paymentBatches)
      .where(and(eq(paymentBatches.tenantId, this.tenantId), eq(paymentBatches.batchId, input.batchId)))
      .limit(1);

    if (existing.length > 0) throw new ConflictError(`Batch '${input.batchId}' already exists for this tenant`);

    const matchedInstructions = await this.matchVendors(input.instructions);

    const totalAmount = input.instructions.reduce((s, i) => s + i.amount, 0);

    const batch = await this.db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(paymentBatches)
        .values({
          tenantId: this.tenantId,
          batchId: input.batchId,
          source: input.source,
          description: input.description ?? null,
          totalCount: input.instructions.length,
          totalAmount: totalAmount.toString(),
        })
        .returning();

      await tx.insert(paymentInstructions).values(
        matchedInstructions.map((item) => ({
          tenantId: this.tenantId,
          batchId: batch!.id,
          vendorId: item.vendorId ?? null,
          vendorName: item.vendorName,
          amount: item.amount.toString(),
          reference: item.reference ?? null,
          reason: item.reason ?? null,
          dueDate: item.dueDate ?? null,
        })),
      );

      return batch!;
    });

    return this.getBatch(batch.id);
  }

  async listBatches(params: BatchListParams): Promise<BatchListResult> {
    const { page, limit, status, source } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(paymentBatches.tenantId, this.tenantId),
      status ? eq(paymentBatches.status, status) : undefined,
      source ? ilike(paymentBatches.source, `%${source}%`) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db.select().from(paymentBatches).where(baseWhere).orderBy(desc(paymentBatches.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(paymentBatches).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(this.toBatch),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getBatch(id: string): Promise<PaymentBatchWithInstructions> {
    const [batch] = await this.db
      .select()
      .from(paymentBatches)
      .where(and(eq(paymentBatches.id, id), eq(paymentBatches.tenantId, this.tenantId)))
      .limit(1);

    if (!batch) throw new NotFoundError('Payment batch');

    const instructions = await this.db
      .select()
      .from(paymentInstructions)
      .where(and(eq(paymentInstructions.batchId, id), eq(paymentInstructions.tenantId, this.tenantId)))
      .orderBy(paymentInstructions.createdAt);

    return {
      ...this.toBatch(batch),
      instructions: instructions.map(this.toInstruction),
    };
  }

  async approveInstructions(batchId: string, input: ApproveInstructionsInput): Promise<PaymentBatchWithInstructions> {
    await this.assertBatchExists(batchId);

    await this.db
      .update(paymentInstructions)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(
        and(
          eq(paymentInstructions.batchId, batchId),
          eq(paymentInstructions.tenantId, this.tenantId),
          inArray(paymentInstructions.id, input.instructionIds),
        ),
      );

    await this.syncBatchCounts(batchId);
    return this.getBatch(batchId);
  }

  async rejectInstructions(batchId: string, input: RejectInstructionsInput): Promise<PaymentBatchWithInstructions> {
    await this.assertBatchExists(batchId);

    await this.db
      .update(paymentInstructions)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(
        and(
          eq(paymentInstructions.batchId, batchId),
          eq(paymentInstructions.tenantId, this.tenantId),
          inArray(paymentInstructions.id, input.instructionIds),
        ),
      );

    await this.syncBatchCounts(batchId);
    return this.getBatch(batchId);
  }

  async executeBatch(batchId: string, bankAccountId: string): Promise<ExecuteBatchResult> {
    const batch = await this.assertBatchExists(batchId);

    if (batch.status !== 'approved' && batch.status !== 'partially_approved') {
      throw new ConflictError('Batch must be approved or partially approved to execute');
    }

    const approvedRows = await this.db
      .select()
      .from(paymentInstructions)
      .where(
        and(
          eq(paymentInstructions.batchId, batchId),
          eq(paymentInstructions.tenantId, this.tenantId),
          eq(paymentInstructions.status, 'approved'),
        ),
      );

    const result = await this.processApprovedInstructions(approvedRows, bankAccountId, batchId);

    await this.db
      .update(paymentBatches)
      .set({ status: 'executed', updatedAt: new Date() })
      .where(eq(paymentBatches.id, batchId));

    void this.sendBatchSummaryEmail(approvedRows, result.totalPaid);
    return result;
  }

  async exportBatchCSV(batchId: string): Promise<string> {
    await this.assertBatchExists(batchId);

    const rows = await this.db
      .select({
        vendorName: paymentInstructions.vendorName,
        amount: paymentInstructions.amount,
        reference: paymentInstructions.reference,
        reason: paymentInstructions.reason,
        bankAccountName: vendors.bankAccountName,
        bankAccountNumber: vendors.bankAccountNumber,
        bankIfsc: vendors.bankIfsc,
      })
      .from(paymentInstructions)
      .leftJoin(vendors, eq(paymentInstructions.vendorId, vendors.id))
      .where(
        and(
          eq(paymentInstructions.batchId, batchId),
          eq(paymentInstructions.tenantId, this.tenantId),
          eq(paymentInstructions.status, 'approved'),
        ),
      );

    return this.buildCSV(rows);
  }

  private async matchVendors(
    instructions: CreatePaymentBatchInput['instructions'],
  ): Promise<(CreatePaymentBatchInput['instructions'][number] & { vendorId?: string | null })[]> {
    const unmatched = instructions.filter((i) => !i.vendorId);
    if (unmatched.length === 0) return instructions;

    const results = await Promise.all(
      unmatched.map((item) => this.resolveVendorId(item.vendorName)),
    );

    const resolvedMap = new Map(unmatched.map((item, idx) => [item.vendorName, results[idx]]));

    return instructions.map((item) => {
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

  private async sendBatchSummaryEmail(
    rows: (typeof paymentInstructions.$inferSelect)[],
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
      console.error('Batch summary email failed:', err),
    );
  }

  private async processApprovedInstructions(
    rows: (typeof paymentInstructions.$inferSelect)[],
    bankAccountId: string,
    batchId: string,
  ): Promise<ExecuteBatchResult> {
    let paid = 0;
    let failed = 0;
    let totalPaid = 0;

    for (const row of rows) {
      if (!row.vendorId) {
        await this.db
          .update(paymentInstructions)
          .set({ status: 'failed', errorMessage: 'Vendor not matched — no vendor_id', updatedAt: new Date() })
          .where(eq(paymentInstructions.id, row.id));
        failed++;
        continue;
      }

      const today = new Date().toISOString().split('T')[0]!;
      const [payment] = await this.db
        .insert(payments)
        .values({
          tenantId: this.tenantId,
          vendorId: row.vendorId,
          bankAccountId,
          paymentDate: today,
          amount: row.amount,
          paymentMethod: 'bank_transfer',
          utrNumber: row.reference ?? null,
          status: 'completed',
          notes: row.reason ?? null,
        })
        .returning();

      await this.db
        .update(paymentInstructions)
        .set({ status: 'paid', paymentId: payment!.id, updatedAt: new Date() })
        .where(eq(paymentInstructions.id, row.id));

      paid++;
      totalPaid += parseFloat(row.amount);
    }

    void batchId;
    return { paid, failed, totalPaid };
  }

  private async syncBatchCounts(batchId: string): Promise<void> {
    const allRows = await this.db
      .select({ status: paymentInstructions.status, amount: paymentInstructions.amount })
      .from(paymentInstructions)
      .where(and(eq(paymentInstructions.batchId, batchId), eq(paymentInstructions.tenantId, this.tenantId)));

    const approvedRows = allRows.filter((r) => r.status === 'approved');
    const pendingCount = allRows.filter((r) => r.status === 'pending').length;
    const approvedCount = approvedRows.length;
    const approvedAmount = approvedRows.reduce((s, r) => s + parseFloat(r.amount), 0);

    const newStatus = this.deriveBatchStatus(approvedCount, pendingCount, allRows.length);

    await this.db
      .update(paymentBatches)
      .set({
        approvedCount,
        approvedAmount: approvedAmount.toString(),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(paymentBatches.id, batchId));
  }

  private deriveBatchStatus(
    approvedCount: number,
    pendingCount: number,
    totalCount: number,
  ): 'pending_approval' | 'partially_approved' | 'approved' | 'rejected' {
    if (approvedCount === 0 && pendingCount === 0) return 'rejected';
    if (approvedCount === totalCount) return 'approved';
    if (approvedCount > 0) return 'partially_approved';
    return 'pending_approval';
  }

  private async assertBatchExists(batchId: string): Promise<typeof paymentBatches.$inferSelect> {
    const [batch] = await this.db
      .select()
      .from(paymentBatches)
      .where(and(eq(paymentBatches.id, batchId), eq(paymentBatches.tenantId, this.tenantId)))
      .limit(1);

    if (!batch) throw new NotFoundError('Payment batch');
    return batch;
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

  private toBatch(row: typeof paymentBatches.$inferSelect): PaymentBatch {
    return {
      id: row.id,
      tenantId: row.tenantId,
      batchId: row.batchId,
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

  private toInstruction(row: typeof paymentInstructions.$inferSelect): PaymentInstruction {
    return {
      id: row.id,
      tenantId: row.tenantId,
      batchId: row.batchId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      amount: parseFloat(row.amount),
      reference: row.reference,
      reason: row.reason,
      dueDate: row.dueDate,
      status: row.status,
      paymentId: row.paymentId,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

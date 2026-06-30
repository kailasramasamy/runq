import { eq, and, desc, sql } from 'drizzle-orm';
import { pendingPayments, accounts, bankAccounts } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreatePendingPaymentInput, UpdatePendingPaymentInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

/**
 * CRUD for captured-at-pay-time payments awaiting their bank line. No GL
 * posting happens here — that's done by PendingPaymentMatchService when the
 * matching debit is imported.
 */
export class PendingPaymentService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async create(input: CreatePendingPaymentInput, createdBy: string) {
    const [row] = await this.db
      .insert(pendingPayments)
      .values({
        tenantId: this.tenantId,
        bankAccountId: input.bankAccountId,
        amount: input.amount.toString(),
        paymentDate: input.paymentDate,
        glAccountId: input.glAccountId,
        payeeName: input.payeeName ?? null,
        note: input.note ?? null,
        upiRef: input.upiRef ?? null,
        createdBy,
      })
      .returning();
    return row;
  }

  /** History for the quick-expenses screen. Omit status for all rows. */
  async list(status?: 'pending' | 'matched' | 'cancelled') {
    return this.db
      .select({
        id: pendingPayments.id,
        bankAccountId: pendingPayments.bankAccountId,
        amount: pendingPayments.amount,
        paymentDate: pendingPayments.paymentDate,
        glAccountId: pendingPayments.glAccountId,
        glAccountCode: accounts.code,
        glAccountName: accounts.name,
        payeeName: pendingPayments.payeeName,
        note: pendingPayments.note,
        upiRef: pendingPayments.upiRef,
        status: pendingPayments.status,
        bankAccountName: bankAccounts.bankName,
        bankAccountNumber: bankAccounts.accountNumber,
        matchedBankTransactionId: pendingPayments.matchedBankTransactionId,
        // The confirmation photo lives under 'expense' while pending and moves
        // to 'bank_transaction' once matched — surface its id either way.
        attachmentId: sql<string | null>`(
          SELECT da.id FROM document_attachments da
          WHERE da.tenant_id = ${this.tenantId}
            AND ((da.entity_type = 'expense' AND da.entity_id = ${pendingPayments.id})
              OR (da.entity_type = 'bank_transaction' AND da.entity_id = ${pendingPayments.matchedBankTransactionId}))
          LIMIT 1
        )`,
        createdAt: pendingPayments.createdAt,
      })
      .from(pendingPayments)
      .leftJoin(accounts, eq(pendingPayments.glAccountId, accounts.id))
      .leftJoin(bankAccounts, eq(pendingPayments.bankAccountId, bankAccounts.id))
      .where(and(
        eq(pendingPayments.tenantId, this.tenantId),
        status ? eq(pendingPayments.status, status) : undefined,
      ))
      .orderBy(desc(pendingPayments.createdAt));
  }

  /** Edit a still-pending capture. Matched/cancelled rows are immutable. */
  async update(id: string, input: UpdatePendingPaymentInput): Promise<void> {
    const set: Partial<typeof pendingPayments.$inferInsert> = { updatedAt: new Date() };
    if (input.bankAccountId !== undefined) set.bankAccountId = input.bankAccountId;
    if (input.amount !== undefined) set.amount = input.amount.toString();
    if (input.paymentDate !== undefined) set.paymentDate = input.paymentDate;
    if (input.glAccountId !== undefined) set.glAccountId = input.glAccountId;
    if (input.payeeName !== undefined) set.payeeName = input.payeeName ?? null;
    if (input.note !== undefined) set.note = input.note ?? null;
    if (input.upiRef !== undefined) set.upiRef = input.upiRef ?? null;
    const [row] = await this.db
      .update(pendingPayments)
      .set(set)
      .where(and(
        eq(pendingPayments.id, id),
        eq(pendingPayments.tenantId, this.tenantId),
        eq(pendingPayments.status, 'pending'),
      ))
      .returning({ id: pendingPayments.id });
    if (!row) throw new NotFoundError('Pending payment');
  }

  async cancel(id: string): Promise<void> {
    const [row] = await this.db
      .update(pendingPayments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(pendingPayments.id, id),
        eq(pendingPayments.tenantId, this.tenantId),
        eq(pendingPayments.status, 'pending'),
      ))
      .returning({ id: pendingPayments.id });
    if (!row) throw new NotFoundError('Pending payment');
  }
}

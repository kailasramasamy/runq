import { eq, and, desc } from 'drizzle-orm';
import { pendingPayments, accounts, bankAccounts } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreatePendingPaymentInput } from '@runq/validators';
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

  async list(status: 'pending' | 'matched' | 'cancelled') {
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
        bankAccountName: bankAccounts.accountNumber,
        matchedBankTransactionId: pendingPayments.matchedBankTransactionId,
        createdAt: pendingPayments.createdAt,
      })
      .from(pendingPayments)
      .leftJoin(accounts, eq(pendingPayments.glAccountId, accounts.id))
      .leftJoin(bankAccounts, eq(pendingPayments.bankAccountId, bankAccounts.id))
      .where(and(eq(pendingPayments.tenantId, this.tenantId), eq(pendingPayments.status, status)))
      .orderBy(desc(pendingPayments.createdAt));
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

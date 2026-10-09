import { eq, and, desc, sql, isNull, inArray } from 'drizzle-orm';
import { pendingPayments, accounts, bankAccounts } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreatePendingPaymentInput, UpdatePendingPaymentInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

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
        linkedBillNumber: this.linkedBillNumberSql(),
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
    await this.assertUnlinked(id);
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
    await this.assertUnlinked(id);
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

  /**
   * Captures that could be the payment for a bill: same amount (±₹1), within
   * ±45 days, not yet used for another bill. Ranked by how well the payee
   * matches the vendor name, then by date distance.
   */
  async candidates(q: { amount: number; date: string; vendorName?: string }) {
    const rows = await this.db
      .select({
        id: pendingPayments.id,
        amount: pendingPayments.amount,
        paymentDate: pendingPayments.paymentDate,
        payeeName: pendingPayments.payeeName,
        note: pendingPayments.note,
        upiRef: pendingPayments.upiRef,
        status: pendingPayments.status,
        bankAccountName: bankAccounts.bankName,
        bankAccountNumber: bankAccounts.accountNumber,
      })
      .from(pendingPayments)
      .innerJoin(bankAccounts, eq(pendingPayments.bankAccountId, bankAccounts.id))
      .where(and(
        eq(pendingPayments.tenantId, this.tenantId),
        isNull(pendingPayments.paymentId),
        inArray(pendingPayments.status, ['pending', 'matched']),
        sql`ABS(${pendingPayments.amount}::numeric - ${q.amount}) < 1`,
        sql`ABS(${pendingPayments.paymentDate}::date - ${q.date}::date) <= ${CANDIDATE_WINDOW_DAYS}`,
      ));
    const tokens = nameTokens(q.vendorName ?? '');
    const dayGap = (d: string) => Math.abs(Date.parse(d) - Date.parse(q.date)) / 86_400_000;
    return rows
      .map((r) => ({ ...r, payeeMatch: payeeScore(tokens, `${r.payeeName ?? ''} ${r.note ?? ''}`) }))
      .sort((a, b) => b.payeeMatch - a.payeeMatch || dayGap(a.paymentDate) - dayGap(b.paymentDate))
      .slice(0, 5);
  }

  /** A capture that settled a bill is owned by that bill's payment now. */
  private async assertUnlinked(id: string): Promise<void> {
    const [row] = await this.db.select({ paymentId: pendingPayments.paymentId }).from(pendingPayments)
      .where(and(eq(pendingPayments.id, id), eq(pendingPayments.tenantId, this.tenantId))).limit(1);
    if (row?.paymentId) throw new ConflictError(LINKED_MSG);
  }

  private linkedBillNumberSql() {
    return sql<string | null>`(
      SELECT pi.invoice_number FROM payment_allocations pa
      JOIN purchase_invoices pi ON pi.id = pa.invoice_id
      WHERE pa.payment_id = ${pendingPayments.paymentId}
      LIMIT 1
    )`;
  }
}

const CANDIDATE_WINDOW_DAYS = 45;
const LINKED_MSG = 'This payment settles a bill — change it from the bill instead';
// Words every company name shares; matching on them says nothing.
const GENERIC = new Set(['private', 'limited', 'pvt', 'ltd', 'and', 'the', 'company', 'enterprises', 'traders', 'agencies']);

function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !GENERIC.has(t));
}

/** Count vendor-name words found in the payee text, ignoring spacing ("SRISVISHNU" ~ "Sri Vishnu"). */
function payeeScore(tokens: string[], payee: string): number {
  const squashed = payee.toLowerCase().replace(/[^a-z0-9]/g, '');
  return tokens.filter((t) => squashed.includes(t)).length;
}

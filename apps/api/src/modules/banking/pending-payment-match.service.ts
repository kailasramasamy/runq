import { eq, and, inArray, isNull } from 'drizzle-orm';
import { bankTransactions, bankAccounts, accounts, pendingPayments, documentAttachments } from '@runq/db';
import type { Db } from '@runq/db';
import { CategorizePostingService } from './categorize-posting.service';

const MATCH_DATE_WINDOW_DAYS = 5;

type Pending = typeof pendingPayments.$inferSelect;
interface Debit { id: string; amount: string; transactionDate: string; narration: string | null; reference: string | null }

/**
 * Reconciles freshly-imported bank debits against captured pending payments.
 * For each unambiguous match it posts the expense (Dr category / Cr bank),
 * carries the note as the txn memo, moves the confirmation photo onto the
 * txn, and marks the pending payment matched. Runs before suspense
 * categorisation so a captured payment lands on its real account.
 */
export class PendingPaymentMatchService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async matchBatch(bankAccountId: string, importBatchId: string): Promise<number> {
    const [debits, pendings, bankGlCode] = await Promise.all([
      this.loadNewDebits(bankAccountId, importBatchId),
      this.loadPending(bankAccountId),
      this.fetchBankGlCode(bankAccountId),
    ]);
    if (!debits.length || !pendings.length || !bankGlCode) return 0;

    const codeById = await this.glCodesFor(pendings.map((p) => p.glAccountId));
    const posting = new CategorizePostingService(this.db, this.tenantId);
    const used = new Set<string>();
    let matched = 0;
    for (const txn of debits) {
      const p = this.pickMatch(txn, pendings, used);
      const glCode = p && codeById.get(p.glAccountId);
      if (!p || !glCode) continue;
      used.add(p.id);
      await this.applyMatch(posting, txn, p, glCode, bankGlCode);
      matched++;
    }
    return matched;
  }

  private async applyMatch(posting: CategorizePostingService, txn: Debit, p: Pending, glCode: string, bankGlCode: string): Promise<void> {
    await this.db.update(bankTransactions)
      .set({ glAccountId: p.glAccountId, memo: p.note ?? null, updatedAt: new Date() })
      .where(and(eq(bankTransactions.id, txn.id), eq(bankTransactions.tenantId, this.tenantId)));
    await posting.postBankDebit({
      transactionId: txn.id,
      transactionDate: txn.transactionDate,
      amount: parseFloat(txn.amount),
      narration: txn.narration,
      memo: p.note,
      glAccountCode: glCode,
      bankGlAccountCode: bankGlCode,
    });
    // Move the captured confirmation photo onto the reconciled bank txn.
    await this.db.update(documentAttachments)
      .set({ entityType: 'bank_transaction', entityId: txn.id })
      .where(and(
        eq(documentAttachments.tenantId, this.tenantId),
        eq(documentAttachments.entityType, 'expense'),
        eq(documentAttachments.entityId, p.id),
      ));
    await this.db.update(pendingPayments)
      .set({ status: 'matched', matchedBankTransactionId: txn.id, matchedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pendingPayments.id, p.id), eq(pendingPayments.tenantId, this.tenantId)));
  }

  // Prefer an exact UPI-reference hit; else an exact amount within the date
  // window. Only auto-match when exactly one candidate remains — ambiguous
  // ones are left for manual reconciliation rather than guessed.
  private pickMatch(txn: Debit, pendings: Pending[], used: Set<string>): Pending | null {
    const avail = pendings.filter((p) => !used.has(p.id));
    const ref = `${txn.narration ?? ''} ${txn.reference ?? ''}`;
    const byRef = avail.filter((p) => p.upiRef && ref.includes(p.upiRef));
    if (byRef.length === 1) return byRef[0]!;
    const amt = parseFloat(txn.amount);
    const byAmt = avail.filter((p) =>
      Math.abs(parseFloat(p.amount) - amt) < 0.01 && this.withinWindow(p.paymentDate, txn.transactionDate));
    return byAmt.length === 1 ? byAmt[0]! : null;
  }

  private withinWindow(a: string, b: string): boolean {
    return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000) <= MATCH_DATE_WINDOW_DAYS;
  }

  private loadNewDebits(bankAccountId: string, importBatchId: string): Promise<Debit[]> {
    return this.db
      .select({
        id: bankTransactions.id,
        amount: bankTransactions.amount,
        transactionDate: bankTransactions.transactionDate,
        narration: bankTransactions.narration,
        reference: bankTransactions.reference,
      })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.bankAccountId, bankAccountId),
        eq(bankTransactions.importBatchId, importBatchId),
        eq(bankTransactions.type, 'debit'),
        eq(bankTransactions.reconStatus, 'unreconciled'),
        isNull(bankTransactions.glAccountId),
      ));
  }

  private loadPending(bankAccountId: string): Promise<Pending[]> {
    return this.db
      .select()
      .from(pendingPayments)
      .where(and(
        eq(pendingPayments.tenantId, this.tenantId),
        eq(pendingPayments.bankAccountId, bankAccountId),
        eq(pendingPayments.status, 'pending'),
      ));
  }

  private async glCodesFor(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: accounts.id, code: accounts.code })
      .from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), inArray(accounts.id, ids)));
    return new Map(rows.map((r) => [r.id, r.code]));
  }

  private async fetchBankGlCode(bankAccountId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);
    return row?.code ?? null;
  }
}

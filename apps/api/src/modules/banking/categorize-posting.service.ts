import { eq, and } from 'drizzle-orm';
import { bankTransactions, journalEntries } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';

interface PostBankTxnParams {
  transactionId: string;
  transactionDate: string;
  amount: number;
  narration: string | null;
  glAccountCode: string;
  bankGlAccountCode: string;
}

export class CategorizePostingService {
  private readonly gl: GLService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.gl = new GLService(db, tenantId);
  }

  /**
   * Post a journal entry for a categorized bank debit transaction.
   * DR: categorized GL account (expense/asset)
   * CR: bank's GL account
   */
  async postBankDebit(params: PostBankTxnParams): Promise<string | null> {
    if (await this.isAlreadyPosted('bank_debit', params.transactionId)) return null;

    const entry = await this.gl.createJournalEntry({
      date: params.transactionDate,
      description: `Bank payment: ${params.narration ?? 'N/A'}`,
      sourceType: 'bank_debit',
      sourceId: params.transactionId,
      lines: [
        { accountCode: params.glAccountCode, debit: params.amount },
        { accountCode: params.bankGlAccountCode, credit: params.amount },
      ],
    });

    return this.linkJournalEntry(params.transactionId, entry.id);
  }

  /**
   * Fallback for debits we couldn't categorize: park them in 1116 Bank
   * Suspense so the bank GL stays tied to reality. The user re-categorizes
   * later via setCategory, which reverses this and posts the correct JE.
   */
  async postBankDebitToSuspense(params: Omit<PostBankTxnParams, 'glAccountCode'>): Promise<string | null> {
    return this.postBankDebit({ ...params, glAccountCode: '1116' });
  }

  /**
   * Post a journal entry for a categorized bank credit transaction.
   * DR: bank's GL account
   * CR: categorized GL account (refund recovery, miscellaneous income, etc.)
   *
   * Refuses to post when the credit GL is Accounts Receivable (1103) or
   * a revenue account (4xxx) — those represent customer payments, which
   * must flow through AutoReceiptService so a receipt + allocations are
   * created. Posting them here would either double-count revenue or leave
   * AR untouched while the customer's invoices stay open.
   */
  async postBankCredit(params: PostBankTxnParams): Promise<string | null> {
    // Customer payments must flow through AutoReceiptService so a receipt +
    // allocations are created; CR'ing AR or revenue from here either leaves
    // AR untouched (invoices stay open) or double-counts revenue.
    if (this.isCustomerPaymentAccount(params.glAccountCode)) return null;
    if (await this.isAlreadyPosted('bank_credit', params.transactionId)) return null;

    const entry = await this.gl.createJournalEntry({
      date: params.transactionDate,
      description: `Bank receipt: ${params.narration ?? 'N/A'}`,
      sourceType: 'bank_credit',
      sourceId: params.transactionId,
      lines: [
        { accountCode: params.bankGlAccountCode, debit: params.amount },
        { accountCode: params.glAccountCode, credit: params.amount },
      ],
    });

    return this.linkJournalEntry(params.transactionId, entry.id);
  }

  private async linkJournalEntry(transactionId: string, journalEntryId: string): Promise<string> {
    await this.db
      .update(bankTransactions)
      .set({
        journalEntryId,
        reconStatus: 'matched',
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankTransactions.id, transactionId),
        eq(bankTransactions.tenantId, this.tenantId),
      ));
    return journalEntryId;
  }

  private isCustomerPaymentAccount(code: string): boolean {
    return code === '1103' || /^4\d{3}$/.test(code);
  }

  private async isAlreadyPosted(sourceType: string, transactionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        eq(journalEntries.sourceType, sourceType),
        eq(journalEntries.sourceId, transactionId),
      ))
      .limit(1);
    return !!row;
  }
}

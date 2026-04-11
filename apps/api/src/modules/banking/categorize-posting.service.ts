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
   * Post a journal entry for a categorized bank credit transaction.
   * DR: bank's GL account
   * CR: categorized GL account (AR, income, etc.)
   */
  async postBankCredit(params: PostBankTxnParams): Promise<string | null> {
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

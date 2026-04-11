import { eq, and } from 'drizzle-orm';
import { bankTransactions, journalEntries } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';

interface PostBankDebitParams {
  transactionId: string;
  transactionDate: string;
  amount: number;
  narration: string | null;
  expenseAccountCode: string;
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
   * Returns the journal entry ID, or null if already posted.
   */
  async postBankDebit(params: PostBankDebitParams): Promise<string | null> {
    if (await this.isAlreadyPosted(params.transactionId)) return null;

    const entry = await this.gl.createJournalEntry({
      date: params.transactionDate,
      description: `Bank payment: ${params.narration ?? 'N/A'}`,
      sourceType: 'bank_debit',
      sourceId: params.transactionId,
      lines: [
        { accountCode: params.expenseAccountCode, debit: params.amount },
        { accountCode: params.bankGlAccountCode, credit: params.amount },
      ],
    });

    await this.db
      .update(bankTransactions)
      .set({
        journalEntryId: entry.id,
        reconStatus: 'matched',
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankTransactions.id, params.transactionId),
        eq(bankTransactions.tenantId, this.tenantId),
      ));

    return entry.id;
  }

  private async isAlreadyPosted(transactionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        eq(journalEntries.sourceType, 'bank_debit'),
        eq(journalEntries.sourceId, transactionId),
      ))
      .limit(1);
    return !!row;
  }
}

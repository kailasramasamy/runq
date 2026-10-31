import { and, eq } from 'drizzle-orm';
import { accounts, journalEntries, journalLines, pnlProfitMarks } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { STOCK_CODES } from './monthly-pnl.service';

export interface ProfitMarkRef { journalEntryId: string; accountId: string }

/**
 * Marks an expense line as profit taken out, for the internal monthly P&L
 * only. The GL entry is left exactly as posted.
 */
export class ProfitMarkService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async mark(ref: ProfitMarkRef, userId: string | null): Promise<void> {
    await this.assertMarkable(ref);
    await this.db.insert(pnlProfitMarks)
      .values({ tenantId: this.tenantId, ...ref, markedBy: userId })
      .onConflictDoNothing();
  }

  async unmark(ref: ProfitMarkRef): Promise<void> {
    await this.db.delete(pnlProfitMarks).where(and(
      eq(pnlProfitMarks.tenantId, this.tenantId),
      eq(pnlProfitMarks.journalEntryId, ref.journalEntryId),
      eq(pnlProfitMarks.accountId, ref.accountId),
    ));
  }

  /** The entry must be this tenant's, posted, and actually debit an expense account on it. */
  private async assertMarkable(ref: ProfitMarkRef): Promise<void> {
    const [line] = await this.db
      .select({ code: accounts.code, type: accounts.type })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        eq(journalEntries.id, ref.journalEntryId),
        eq(journalEntries.status, 'posted'),
        eq(journalLines.accountId, ref.accountId),
      ))
      .limit(1);
    if (!line) throw new NotFoundError('Journal entry line');
    if (line.type !== 'expense' || STOCK_CODES.has(line.code)) {
      throw new ValidationError('Only expense entries can be marked as profit taken out');
    }
  }
}

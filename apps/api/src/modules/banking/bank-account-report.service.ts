import { eq, and, gte, lte, ne, sql } from 'drizzle-orm';
import { bankTransactions, bankAccounts, accounts } from '@runq/db';
import type { Db } from '@runq/db';
import type { BankAccountReport, ReportCategoryAmount } from '@runq/types';
import { NotFoundError } from '../../utils/errors';

// Control/suspense accounts many categorized txns land on. Relabel them so the
// report reads as cash movement, not GL plumbing.
const CONTROL_LABELS: Record<string, string> = {
  '1116': 'Uncategorized (suspense)',
  '2101': 'Vendor payments',
  '1103': 'Customer receipts',
  '2102': 'Customer advances',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aggregates a single bank account's transactions into an income/spend report. */
export class BankAccountReportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getReport(accountId: string, dateFrom: string, dateTo: string): Promise<BankAccountReport> {
    await this.assertAccount(accountId);

    const where = and(
      eq(bankTransactions.tenantId, this.tenantId),
      eq(bankTransactions.bankAccountId, accountId),
      gte(bankTransactions.transactionDate, dateFrom),
      lte(bankTransactions.transactionDate, dateTo),
      ne(bankTransactions.reconStatus, 'excluded'),
    );
    const debitSum = sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.type} = 'debit' THEN ${bankTransactions.amount} ELSE 0 END), 0)`;
    const creditSum = sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.type} = 'credit' THEN ${bankTransactions.amount} ELSE 0 END), 0)`;

    const catRows = await this.db
      .select({ accountId: accounts.id, code: accounts.code, name: accounts.name, debit: debitSum, credit: creditSum, count: sql<number>`COUNT(*)::int` })
      .from(bankTransactions)
      .leftJoin(accounts, eq(accounts.id, bankTransactions.glAccountId))
      .where(where)
      .groupBy(accounts.id, accounts.code, accounts.name);

    const monthExpr = sql<string>`TO_CHAR(${bankTransactions.transactionDate}, 'YYYY-MM')`;
    const monthRows = await this.db
      .select({ month: monthExpr, moneyIn: creditSum, moneyOut: debitSum })
      .from(bankTransactions)
      .where(where)
      .groupBy(monthExpr)
      .orderBy(monthExpr);

    const moneyIn = round2(catRows.reduce((s, r) => s + Number(r.credit), 0));
    const moneyOut = round2(catRows.reduce((s, r) => s + Number(r.debit), 0));
    return {
      accountId,
      period: { dateFrom, dateTo },
      summary: { moneyIn, moneyOut, net: round2(moneyIn - moneyOut), txnCount: catRows.reduce((s, r) => s + Number(r.count), 0) },
      spendByCategory: this.buildCategories(catRows, 'debit'),
      incomeByCategory: this.buildCategories(catRows, 'credit'),
      byMonth: monthRows.map((m) => ({ month: m.month, moneyIn: round2(Number(m.moneyIn)), moneyOut: round2(Number(m.moneyOut)) })),
    };
  }

  private buildCategories(
    rows: { accountId: string | null; code: string | null; name: string | null; debit: string; credit: string }[],
    side: 'debit' | 'credit',
  ): ReportCategoryAmount[] {
    const items = rows
      .map((r) => ({ accountId: r.accountId, code: r.code, name: this.label(r.code, r.name), amount: round2(Number(r[side])) }))
      .filter((i) => i.amount > 0);
    const total = items.reduce((s, i) => s + i.amount, 0);
    return items
      .map((i) => ({ ...i, percentage: total > 0 ? Math.round((i.amount / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }

  private label(code: string | null, name: string | null): string {
    if (!code) return 'Uncategorized';
    return CONTROL_LABELS[code] ?? name ?? 'Uncategorized';
  }

  private async assertAccount(accountId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Bank account not found');
  }
}

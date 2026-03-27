import { eq, and, sql } from 'drizzle-orm';
import { bankTransactions, accounts } from '@runq/db';
import type { Db } from '@runq/db';

interface ChargesSummaryRow {
  month: string;
  charges: number;
  interest: number;
  penalties: number;
  total: number;
}

const BANK_CHARGES_CODE = '5007';
const INTEREST_INCOME_CODE = '4002';

export class BankChargesService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getChargesSummary(bankAccountId: string): Promise<ChargesSummaryRow[]> {
    const chargeAccountIds = await this.getAccountIdsByCodes([BANK_CHARGES_CODE, INTEREST_INCOME_CODE]);
    if (chargeAccountIds.length === 0) return [];

    const rows = await this.queryGroupedByMonth(bankAccountId, chargeAccountIds);
    return this.aggregateByMonth(rows);
  }

  private async getAccountIdsByCodes(codes: string[]): Promise<{ id: string; code: string }[]> {
    return this.db
      .select({ id: accounts.id, code: accounts.code })
      .from(accounts)
      .where(and(
        eq(accounts.tenantId, this.tenantId),
        sql`${accounts.code} = ANY(${codes})`,
      ));
  }

  private async queryGroupedByMonth(
    bankAccountId: string,
    acctRows: { id: string; code: string }[],
  ) {
    const acctIds = acctRows.map((a) => a.id);
    return this.db
      .select({
        month: sql<string>`TO_CHAR(${bankTransactions.transactionDate}::date, 'YYYY-MM')`,
        glAccountId: bankTransactions.glAccountId,
        total: sql<string>`COALESCE(SUM(${bankTransactions.amount}), 0)::text`,
      })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.bankAccountId, bankAccountId),
        sql`${bankTransactions.glAccountId} = ANY(${acctIds})`,
      ))
      .groupBy(sql`1`, bankTransactions.glAccountId);
  }

  private aggregateByMonth(
    rows: { month: string; glAccountId: string | null; total: string }[],
  ): ChargesSummaryRow[] {
    const map = new Map<string, ChargesSummaryRow>();

    for (const row of rows) {
      if (!map.has(row.month)) {
        map.set(row.month, { month: row.month, charges: 0, interest: 0, penalties: 0, total: 0 });
      }
      const entry = map.get(row.month)!;
      const amount = parseFloat(row.total) || 0;

      // We identify by the glAccountId — charges vs interest
      // For now penalties is a placeholder (no separate GL code)
      entry.charges += amount;
      entry.total += amount;
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }
}

import { and, eq, gt, gte, lt, lte, notInArray, sql, sum } from 'drizzle-orm';
import { purchaseInvoices, salesInvoices, bankAccounts } from '@runq/db';
import type { Db } from '@runq/db';

export interface AgingBucket {
  count: number;
  amount: string;
}

export interface AgingResult {
  current: AgingBucket;
  days1to30: AgingBucket;
  days31to60: AgingBucket;
  days61to90: AgingBucket;
  days90plus: AgingBucket;
}

const EXCLUDED_STATUSES_PI = ['paid', 'cancelled', 'draft'] as const;
const EXCLUDED_STATUSES_SI = ['paid', 'cancelled', 'draft'] as const;
const OVERDUE_EXCL = ['paid', 'cancelled'] as const;
const UPCOMING_STATUSES = ['approved', 'partially_paid'] as const;

function zeroAging(): AgingResult {
  const bucket = { count: 0, amount: '0' };
  return { current: { ...bucket }, days1to30: { ...bucket }, days31to60: { ...bucket }, days61to90: { ...bucket }, days90plus: { ...bucket } };
}

export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getSummary() {
    const today = new Date().toISOString().split('T')[0]!;
    const plus7 = new Date(Date.now() + 7 * 86400_000).toISOString().split('T')[0]!;

    const [payables, receivables, cash, overduePI, overdueSI, upcoming] = await Promise.all([
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
        .from(purchaseInvoices)
        .where(and(eq(purchaseInvoices.tenantId, this.tenantId), notInArray(purchaseInvoices.status, [...EXCLUDED_STATUSES_PI]))),

      this.db
        .select({ total: sql<string>`COALESCE(SUM(${salesInvoices.balanceDue}), 0)::text` })
        .from(salesInvoices)
        .where(and(eq(salesInvoices.tenantId, this.tenantId), notInArray(salesInvoices.status, [...EXCLUDED_STATUSES_SI]))),

      this.db
        .select({ total: sql<string>`COALESCE(SUM(${bankAccounts.currentBalance}), 0)::text` })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true))),

      this.db
        .select({ count: sql<number>`COUNT(*)::int`, amount: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
        .from(purchaseInvoices)
        .where(and(eq(purchaseInvoices.tenantId, this.tenantId), lt(purchaseInvoices.dueDate, today), notInArray(purchaseInvoices.status, [...OVERDUE_EXCL]))),

      this.db
        .select({ count: sql<number>`COUNT(*)::int`, amount: sql<string>`COALESCE(SUM(${salesInvoices.balanceDue}), 0)::text` })
        .from(salesInvoices)
        .where(and(eq(salesInvoices.tenantId, this.tenantId), lt(salesInvoices.dueDate, today), notInArray(salesInvoices.status, [...OVERDUE_EXCL]))),

      this.db
        .select({ count: sql<number>`COUNT(*)::int`, amount: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text` })
        .from(purchaseInvoices)
        .where(and(eq(purchaseInvoices.tenantId, this.tenantId), gte(purchaseInvoices.dueDate, today), lte(purchaseInvoices.dueDate, plus7), sql`${purchaseInvoices.status} = ANY(ARRAY[${sql.raw(UPCOMING_STATUSES.map((s) => `'${s}'`).join(','))}]::purchase_invoice_status[])`)),
    ]);

    return {
      totalOutstandingPayables: payables[0]?.total ?? '0',
      totalOutstandingReceivables: receivables[0]?.total ?? '0',
      cashPosition: cash[0]?.total ?? '0',
      overdue: {
        payables: { count: overduePI[0]?.count ?? 0, amount: overduePI[0]?.amount ?? '0' },
        receivables: { count: overdueSI[0]?.count ?? 0, amount: overdueSI[0]?.amount ?? '0' },
      },
      upcomingPayments7Days: { count: upcoming[0]?.count ?? 0, amount: upcoming[0]?.amount ?? '0' },
    };
  }

  async getBankBalances() {
    const rows = await this.db
      .select({
        id: bankAccounts.id,
        name: bankAccounts.name,
        bankName: bankAccounts.bankName,
        accountType: bankAccounts.accountType,
        currentBalance: bankAccounts.currentBalance,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true)));

    const accounts = rows.map((r) => ({
      id: r.id,
      name: r.name,
      bankName: r.bankName,
      accountType: r.accountType,
      currentBalance: r.currentBalance,
    }));

    const total = rows.reduce((sum, r) => sum + (parseFloat(r.currentBalance) || 0), 0);
    return { accounts, total: total.toFixed(2) };
  }

  async getPayablesAging(): Promise<AgingResult> {
    const today = new Date().toISOString().split('T')[0]!;
    const rows = await this.db
      .select({
        bucket: sql<string>`
          CASE
            WHEN ${purchaseInvoices.dueDate} >= ${today} THEN 'current'
            WHEN (${today}::date - ${purchaseInvoices.dueDate}::date) BETWEEN 1 AND 30 THEN '1-30'
            WHEN (${today}::date - ${purchaseInvoices.dueDate}::date) BETWEEN 31 AND 60 THEN '31-60'
            WHEN (${today}::date - ${purchaseInvoices.dueDate}::date) BETWEEN 61 AND 90 THEN '61-90'
            ELSE '90+'
          END`,
        count: sql<number>`COUNT(*)::int`,
        amount: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text`,
      })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.tenantId, this.tenantId), notInArray(purchaseInvoices.status, [...EXCLUDED_STATUSES_PI])))
      .groupBy(sql`1`);

    return this.bucketiseAging(rows);
  }

  async getReceivablesAging(): Promise<AgingResult> {
    const today = new Date().toISOString().split('T')[0]!;
    const rows = await this.db
      .select({
        bucket: sql<string>`
          CASE
            WHEN ${salesInvoices.dueDate} >= ${today} THEN 'current'
            WHEN (${today}::date - ${salesInvoices.dueDate}::date) BETWEEN 1 AND 30 THEN '1-30'
            WHEN (${today}::date - ${salesInvoices.dueDate}::date) BETWEEN 31 AND 60 THEN '31-60'
            WHEN (${today}::date - ${salesInvoices.dueDate}::date) BETWEEN 61 AND 90 THEN '61-90'
            ELSE '90+'
          END`,
        count: sql<number>`COUNT(*)::int`,
        amount: sql<string>`COALESCE(SUM(${salesInvoices.balanceDue}), 0)::text`,
      })
      .from(salesInvoices)
      .where(and(eq(salesInvoices.tenantId, this.tenantId), notInArray(salesInvoices.status, [...EXCLUDED_STATUSES_SI])))
      .groupBy(sql`1`);

    return this.bucketiseAging(rows);
  }

  private bucketiseAging(rows: { bucket: string; count: number; amount: string }[]): AgingResult {
    const result = zeroAging();
    for (const row of rows) {
      const bucket = { count: row.count, amount: row.amount };
      if (row.bucket === 'current') result.current = bucket;
      else if (row.bucket === '1-30') result.days1to30 = bucket;
      else if (row.bucket === '31-60') result.days31to60 = bucket;
      else if (row.bucket === '61-90') result.days61to90 = bucket;
      else if (row.bucket === '90+') result.days90plus = bucket;
    }
    return result;
  }
}

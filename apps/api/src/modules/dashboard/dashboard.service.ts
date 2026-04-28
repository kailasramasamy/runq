import { and, desc, eq, gt, gte, inArray, lt, lte, notInArray, sql, sum } from 'drizzle-orm';
import { auditLog, bankAccounts, bankTransactions, customers, purchaseInvoices, salesInvoices, users, vendors } from '@runq/db';
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

    const [payables, receivables, cash, overduePI, overdueSI, upcoming, unreconciled] = await Promise.all([
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

      this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(bankTransactions)
        .where(and(eq(bankTransactions.tenantId, this.tenantId), eq(bankTransactions.reconStatus, 'unreconciled'))),
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
      unreconciledTxnCount: unreconciled[0]?.count ?? 0,
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

  async getActivity(limit: number) {
    const rows = await this.db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.tenantId, this.tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    if (rows.length === 0) return [];

    const invIds = rows.filter((r) => r.entityType === 'sales_invoice').map((r) => r.entityId);
    const billIds = rows.filter((r) => r.entityType === 'purchase_invoice').map((r) => r.entityId);

    const [invs, bills] = await Promise.all([
      invIds.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              id: salesInvoices.id,
              invoiceNumber: salesInvoices.invoiceNumber,
              totalAmount: salesInvoices.totalAmount,
              customerId: salesInvoices.customerId,
              customerName: customers.name,
            })
            .from(salesInvoices)
            .leftJoin(customers, eq(customers.id, salesInvoices.customerId))
            .where(and(eq(salesInvoices.tenantId, this.tenantId), inArray(salesInvoices.id, invIds))),
      billIds.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              id: purchaseInvoices.id,
              invoiceNumber: purchaseInvoices.invoiceNumber,
              totalAmount: purchaseInvoices.totalAmount,
              vendorId: purchaseInvoices.vendorId,
              vendorName: vendors.name,
            })
            .from(purchaseInvoices)
            .leftJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
            .where(and(eq(purchaseInvoices.tenantId, this.tenantId), inArray(purchaseInvoices.id, billIds))),
    ]);

    const invMap = new Map(invs.map((i) => [i.id, i]));
    const billMap = new Map(bills.map((b) => [b.id, b]));

    return rows.map((r) => {
      let entityRef: string | null = null;
      let amount: number | null = null;
      let counterparty: string | null = null;

      if (r.entityType === 'sales_invoice') {
        const i = invMap.get(r.entityId);
        if (i) {
          entityRef = i.invoiceNumber;
          amount = parseFloat(i.totalAmount) || null;
          counterparty = i.customerName ?? null;
        }
      } else if (r.entityType === 'purchase_invoice') {
        const b = billMap.get(r.entityId);
        if (b) {
          entityRef = b.invoiceNumber;
          amount = parseFloat(b.totalAmount) || null;
          counterparty = b.vendorName ?? null;
        }
      }

      return {
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        entityRef,
        amount,
        counterparty,
        userName: r.userName ?? r.userEmail ?? null,
        createdAt: r.createdAt,
      };
    });
  }

  async getCashTrend(days: number) {
    const now = new Date();
    const since = new Date(now);
    since.setDate(now.getDate() - days);
    const sinceIso = since.toISOString().split('T')[0]!;

    const [cashRow, txnRows] = await Promise.all([
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${bankAccounts.currentBalance}), 0)::text` })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true))),
      this.db
        .select({
          day: sql<string>`${bankTransactions.transactionDate}::text`,
          credits: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.type} = 'credit' THEN ${bankTransactions.amount} ELSE 0 END), 0)::text`,
          debits: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.type} = 'debit' THEN ${bankTransactions.amount} ELSE 0 END), 0)::text`,
        })
        .from(bankTransactions)
        .where(and(eq(bankTransactions.tenantId, this.tenantId), gte(bankTransactions.transactionDate, sinceIso)))
        .groupBy(bankTransactions.transactionDate),
    ]);

    const cashNow = parseFloat(cashRow[0]?.total ?? '0') || 0;
    const netByDay = new Map<string, number>();
    for (const r of txnRows) {
      netByDay.set(r.day, (parseFloat(r.credits) || 0) - (parseFloat(r.debits) || 0));
    }

    // Walk backwards from today, building daily end-of-day balances.
    const spark: number[] = new Array(days).fill(0);
    let bal = cashNow;
    for (let i = 0; i < days; i++) {
      spark[days - 1 - i] = bal;
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0]!;
      bal -= netByDay.get(key) ?? 0;
    }

    const weekIdx = Math.max(0, days - 8);
    const weeklyDelta = cashNow - (spark[weekIdx] ?? cashNow);

    return {
      cashPosition: cashNow.toFixed(2),
      spark: spark.map((v) => Number(v.toFixed(2))),
      weeklyDelta: Number(weeklyDelta.toFixed(2)),
      days,
      asOf: now.toISOString(),
    };
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

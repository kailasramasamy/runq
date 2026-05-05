import { and, desc, eq, gt, gte, inArray, lt, lte, notInArray, sql, sum } from 'drizzle-orm';
import { auditLog, bankAccounts, bankTransactions, customers, fiscalPeriods, gstReturns, purchaseInvoices, salesInvoices, users, vendors } from '@runq/db';
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

  /**
   * 6 months actual (from bank credits/debits) + 3 months forecast.
   *
   * Forecast per month = max(open invoices due that month, trailing 3-month
   * baseline from bank txns). Baseline ensures the chart is populated even
   * when the books carry no future-dated invoices, which is the common case
   * for businesses on 30-day terms.
   */
  async getCashflowForecast() {
    const now = new Date();
    const startActual = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const startActualIso = this.toDateOnly(startActual);
    const endActualIso = this.toDateOnly(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const endForecastIso = this.toDateOnly(new Date(now.getFullYear(), now.getMonth() + 4, 0));

    const [actualRows, siRows, piRows, overdueRow] = await Promise.all([
      this.db
        .select({
          ym: sql<string>`to_char(${bankTransactions.transactionDate}, 'YYYY-MM')`,
          credits: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.type} = 'credit' THEN ${bankTransactions.amount} ELSE 0 END), 0)::text`,
          debits: sql<string>`COALESCE(SUM(CASE WHEN ${bankTransactions.type} = 'debit' THEN ${bankTransactions.amount} ELSE 0 END), 0)::text`,
        })
        .from(bankTransactions)
        .where(and(
          eq(bankTransactions.tenantId, this.tenantId),
          gte(bankTransactions.transactionDate, startActualIso),
          lte(bankTransactions.transactionDate, endActualIso),
        ))
        .groupBy(sql`1`),
      this.db
        .select({
          ym: sql<string>`to_char(${salesInvoices.dueDate}, 'YYYY-MM')`,
          amount: sql<string>`COALESCE(SUM(${salesInvoices.balanceDue}), 0)::text`,
        })
        .from(salesInvoices)
        .where(and(
          eq(salesInvoices.tenantId, this.tenantId),
          notInArray(salesInvoices.status, [...EXCLUDED_STATUSES_SI]),
          gt(salesInvoices.dueDate, endActualIso),
          lte(salesInvoices.dueDate, endForecastIso),
        ))
        .groupBy(sql`1`),
      this.db
        .select({
          ym: sql<string>`to_char(${purchaseInvoices.dueDate}, 'YYYY-MM')`,
          amount: sql<string>`COALESCE(SUM(${purchaseInvoices.balanceDue}), 0)::text`,
        })
        .from(purchaseInvoices)
        .where(and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          notInArray(purchaseInvoices.status, [...EXCLUDED_STATUSES_PI]),
          gt(purchaseInvoices.dueDate, endActualIso),
          lte(purchaseInvoices.dueDate, endForecastIso),
        ))
        .groupBy(sql`1`),
      this.db
        .select({
          ar: sql<string>`COALESCE((SELECT SUM(${salesInvoices.balanceDue}) FROM ${salesInvoices} WHERE ${salesInvoices.tenantId} = ${this.tenantId} AND ${salesInvoices.status} NOT IN ('paid','cancelled','draft') AND ${salesInvoices.dueDate} <= ${endActualIso}), 0)::text`,
          ap: sql<string>`COALESCE((SELECT SUM(${purchaseInvoices.balanceDue}) FROM ${purchaseInvoices} WHERE ${purchaseInvoices.tenantId} = ${this.tenantId} AND ${purchaseInvoices.status} NOT IN ('paid','cancelled','draft') AND ${purchaseInvoices.dueDate} <= ${endActualIso}), 0)::text`,
        })
        .from(sql`(SELECT 1) AS dummy`),
    ]);

    const actualMap = new Map(actualRows.map((r) => [r.ym, r]));
    const siMap = new Map(siRows.map((r) => [r.ym, r.amount]));
    const piMap = new Map(piRows.map((r) => [r.ym, r.amount]));

    // Trailing baseline: average of months with bank activity (skip empty months
    // so a tenant with one month of seed data doesn't get its baseline divided
    // by 6).
    const activeMonths = actualRows.filter(
      (r) => parseFloat(r.credits) > 0 || parseFloat(r.debits) > 0,
    );
    const baselineIn = activeMonths.length
      ? activeMonths.reduce((s, r) => s + parseFloat(r.credits), 0) / activeMonths.length
      : 0;
    const baselineOut = activeMonths.length
      ? activeMonths.reduce((s, r) => s + parseFloat(r.debits), 0) / activeMonths.length
      : 0;

    const overdueAr = parseFloat(overdueRow[0]?.ar ?? '0') || 0;
    const overdueAp = parseFloat(overdueRow[0]?.ap ?? '0') || 0;

    const months: { ym: string; label: string; in: number; out: number; forecast: boolean; basis?: string }[] = [];
    for (let i = -5; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short' });
      const isForecast = i > 0;
      if (isForecast) {
        const dueIn = parseFloat(siMap.get(ym) ?? '0') || 0;
        const dueOut = parseFloat(piMap.get(ym) ?? '0') || 0;
        // First forecast month also collects already-overdue AR/AP.
        const overdueInflow = i === 1 ? overdueAr : 0;
        const overdueOutflow = i === 1 ? overdueAp : 0;
        const projectedIn = Math.max(dueIn + overdueInflow, baselineIn);
        const projectedOut = Math.max(dueOut + overdueOutflow, baselineOut);
        const basis =
          projectedIn === dueIn + overdueInflow && projectedIn > 0 ? 'invoices' : 'baseline';
        months.push({ ym, label, in: projectedIn, out: projectedOut, forecast: true, basis });
      } else {
        const a = actualMap.get(ym);
        months.push({
          ym,
          label,
          in: parseFloat(a?.credits ?? '0') || 0,
          out: parseFloat(a?.debits ?? '0') || 0,
          forecast: false,
        });
      }
    }

    const forecastMonths = months.filter((m) => m.forecast);
    const inflow90 = forecastMonths.reduce((s, m) => s + m.in, 0);
    const outflow90 = forecastMonths.reduce((s, m) => s + m.out, 0);

    return {
      months,
      inflow90: inflow90.toFixed(2),
      outflow90: outflow90.toFixed(2),
      net90: (inflow90 - outflow90).toFixed(2),
      baseline: { in: baselineIn.toFixed(2), out: baselineOut.toFixed(2), monthsUsed: activeMonths.length },
    };
  }

  /**
   * Period close checklist for the current month. Each item maps to a
   * concrete data signal:
   *   - Bank reconciliation → all bank txns in period have recon_status != 'unreconciled'
   *   - Invoices reviewed   → no SI in period stuck in 'draft'
   *   - Bills approved      → all PI in period have status in (approved, paid, cancelled, partially_paid)
   *   - GST filed           → gstr1 + gstr3b for prior month both have status 'filed'
   *   - Period locked       → fiscal_periods row for this month has status in (closed, locked)
   */
  async getPeriodClose() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startIso = this.toDateOnly(start);
    const endIso = this.toDateOnly(end);
    const periodLabel = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Prior month for GST filing
    const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const priorPeriod = `${String(prior.getMonth() + 1).padStart(2, '0')}${prior.getFullYear()}`;

    const [bankRow, siRow, piRow, gstRows, fpRow] = await Promise.all([
      this.db
        .select({
          total: sql<number>`COUNT(*)::int`,
          unreconciled: sql<number>`SUM(CASE WHEN ${bankTransactions.reconStatus} = 'unreconciled' THEN 1 ELSE 0 END)::int`,
        })
        .from(bankTransactions)
        .where(and(
          eq(bankTransactions.tenantId, this.tenantId),
          gte(bankTransactions.transactionDate, startIso),
          lte(bankTransactions.transactionDate, endIso),
        )),
      this.db
        .select({
          total: sql<number>`COUNT(*)::int`,
          drafts: sql<number>`SUM(CASE WHEN ${salesInvoices.status} = 'draft' THEN 1 ELSE 0 END)::int`,
        })
        .from(salesInvoices)
        .where(and(
          eq(salesInvoices.tenantId, this.tenantId),
          gte(salesInvoices.invoiceDate, startIso),
          lte(salesInvoices.invoiceDate, endIso),
        )),
      this.db
        .select({
          total: sql<number>`COUNT(*)::int`,
          pending: sql<number>`SUM(CASE WHEN ${purchaseInvoices.status} IN ('draft', 'pending_match', 'matched') THEN 1 ELSE 0 END)::int`,
        })
        .from(purchaseInvoices)
        .where(and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          gte(purchaseInvoices.invoiceDate, startIso),
          lte(purchaseInvoices.invoiceDate, endIso),
        )),
      this.db
        .select({ returnType: gstReturns.returnType, status: gstReturns.status })
        .from(gstReturns)
        .where(and(eq(gstReturns.tenantId, this.tenantId), eq(gstReturns.period, priorPeriod))),
      this.db
        .select({ status: fiscalPeriods.status })
        .from(fiscalPeriods)
        .where(and(eq(fiscalPeriods.tenantId, this.tenantId), eq(fiscalPeriods.startDate, startIso)))
        .limit(1),
    ]);

    const bank = bankRow[0] ?? { total: 0, unreconciled: 0 };
    const si = siRow[0] ?? { total: 0, drafts: 0 };
    const pi = piRow[0] ?? { total: 0, pending: 0 };
    const gstr1Filed = gstRows.some((r) => r.returnType === 'gstr1' && r.status === 'filed');
    const gstr3bFiled = gstRows.some((r) => r.returnType === 'gstr3b' && r.status === 'filed');
    const fpStatus = fpRow[0]?.status ?? 'open';

    type ItemStatus = 'done' | 'progress' | 'pending';
    const items: { key: string; label: string; status: ItemStatus; sub: string }[] = [
      {
        key: 'bank_recon',
        label: 'Bank reconciliation',
        status: bank.total === 0 ? 'pending' : bank.unreconciled === 0 ? 'done' : 'progress',
        sub: bank.total === 0
          ? 'No bank transactions yet'
          : `${bank.total - bank.unreconciled} of ${bank.total} matched`,
      },
      {
        key: 'invoices_reviewed',
        label: 'Invoices reviewed',
        status: si.total === 0 ? 'pending' : si.drafts === 0 ? 'done' : 'progress',
        sub: si.total === 0 ? 'No invoices this period' : `${si.total - si.drafts} of ${si.total} finalised`,
      },
      {
        key: 'bills_approved',
        label: 'Bills approved',
        status: pi.total === 0 ? 'pending' : pi.pending === 0 ? 'done' : 'progress',
        sub: pi.total === 0 ? 'No bills this period' : `${pi.total - pi.pending} of ${pi.total} approved`,
      },
      {
        key: 'gst_filed',
        label: 'GST filed',
        status: gstr1Filed && gstr3bFiled ? 'done' : (gstr1Filed || gstr3bFiled) ? 'progress' : 'pending',
        sub: gstr1Filed && gstr3bFiled
          ? `Filed for ${prior.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
          : `Pending: ${[!gstr1Filed && 'GSTR-1', !gstr3bFiled && 'GSTR-3B'].filter(Boolean).join(', ')}`,
      },
      {
        key: 'period_lock',
        label: 'Period locked',
        status: fpStatus === 'locked' || fpStatus === 'closed' ? 'done' : 'pending',
        sub: fpStatus === 'locked' ? 'Period locked' : fpStatus === 'closed' ? 'Closed, awaiting lock' : 'Run after GST',
      },
    ];

    const doneCount = items.filter((i) => i.status === 'done').length;
    const progressPct = Math.round((doneCount / items.length) * 100);

    return { periodLabel, progressPct, items };
  }

  private toDateOnly(d: Date): string {
    return d.toISOString().split('T')[0]!;
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

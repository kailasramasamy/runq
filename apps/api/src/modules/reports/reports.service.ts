import { eq, and, sql, gte, lte, sum } from 'drizzle-orm';
import {
  accounts,
  journalEntries,
  journalLines,
  bankAccounts,
  purchaseInvoices,
  salesInvoices,
  vendors,
  customers,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  ProfitAndLoss,
  BalanceSheet,
  CashFlowStatement,
  ExpenseAnalytics,
  RevenueAnalytics,
  ComparisonReport,
  CashFlowForecast,
} from '@runq/types';
import { toNumber } from '../../utils/decimal';

interface AccountRow {
  code: string;
  name: string;
  type: string;
  balance: number;
}

export class ReportsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getProfitAndLoss(dateFrom: string, dateTo: string): Promise<ProfitAndLoss> {
    const rows = await this.getAccountBalances(['revenue', 'expense'], dateTo, dateFrom);
    const revenue = this.toLineItems(rows, 'revenue');
    const allExpenses = this.toLineItems(rows, 'expense');

    // Legacy codes (50xx) mapped individually; new codes (51xx-59xx) mapped by prefix
    const COGS_CODES = new Set(['5000', '5001', '5002']);
    const FINANCIAL_CODES = new Set(['5007']); // Bank Charges
    const cogs = allExpenses.filter((e) =>
      COGS_CODES.has(e.accountCode) || e.accountCode.startsWith('51'),
    );
    const operatingExpenses = allExpenses.filter((e) => {
      if (COGS_CODES.has(e.accountCode) || FINANCIAL_CODES.has(e.accountCode)) return false;
      if (e.accountCode.startsWith('50')) return true; // legacy 5003-5009 except 5007
      return ['52', '53', '54', '55', '57'].some((p) => e.accountCode.startsWith(p));
    });
    const depreciation = allExpenses.filter((e) => e.accountCode.startsWith('58'));
    const financialCosts = allExpenses.filter((e) =>
      FINANCIAL_CODES.has(e.accountCode) || e.accountCode.startsWith('56'),
    );
    const taxes = allExpenses.filter((e) => e.accountCode.startsWith('59'));

    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
    const totalCogs = cogs.reduce((s, r) => s + r.amount, 0);
    const grossProfit = totalRevenue - totalCogs;
    const totalOperatingExpenses = operatingExpenses.reduce((s, r) => s + r.amount, 0);
    const operatingProfit = grossProfit - totalOperatingExpenses;
    const totalDepreciation = depreciation.reduce((s, r) => s + r.amount, 0);
    const totalFinancialCosts = financialCosts.reduce((s, r) => s + r.amount, 0);
    const profitBeforeTax = operatingProfit - totalDepreciation - totalFinancialCosts;
    const totalTaxes = taxes.reduce((s, r) => s + r.amount, 0);

    return {
      period: { from: dateFrom, to: dateTo },
      revenue, totalRevenue,
      cogs, totalCogs, grossProfit,
      operatingExpenses, totalOperatingExpenses, operatingProfit,
      depreciation, totalDepreciation,
      financialCosts, totalFinancialCosts,
      profitBeforeTax,
      taxes, totalTaxes,
      netProfit: profitBeforeTax - totalTaxes,
    };
  }

  async getBalanceSheet(asOfDate?: string): Promise<BalanceSheet> {
    const date = asOfDate || new Date().toISOString().split('T')[0]!;
    const rows = await this.getAccountBalances(['asset', 'liability', 'equity'], date);
    const assets = this.toLineItems(rows, 'asset');
    const liabilities = this.toLineItems(rows, 'liability');
    const equity = this.toLineItems(rows, 'equity');

    return {
      asOfDate: date,
      assets, totalAssets: assets.reduce((s, r) => s + r.amount, 0),
      liabilities, totalLiabilities: liabilities.reduce((s, r) => s + r.amount, 0),
      equity, totalEquity: equity.reduce((s, r) => s + r.amount, 0),
    };
  }

  async getCashFlowStatement(dateFrom: string, dateTo: string): Promise<CashFlowStatement> {
    const openingBalance = await this.getCashBalanceAsOf(dateFrom);
    const cashEntries = await this.getCashJournalEntries(dateFrom, dateTo);
    const { operating, investing, financing } = this.classifyCashEntries(cashEntries);

    const totalOperating = operating.reduce((s, r) => s + r.amount, 0);
    const totalInvesting = investing.reduce((s, r) => s + r.amount, 0);
    const totalFinancing = financing.reduce((s, r) => s + r.amount, 0);
    const netChange = totalOperating + totalInvesting + totalFinancing;

    return {
      period: { from: dateFrom, to: dateTo },
      operating, totalOperating,
      investing, totalInvesting,
      financing, totalFinancing,
      netChange, openingBalance,
      closingBalance: openingBalance + netChange,
    };
  }

  async getExpenseAnalytics(dateFrom: string, dateTo: string): Promise<ExpenseAnalytics> {
    const byCategory = await this.getAccountBalances(['expense'], dateTo, dateFrom);
    const total = byCategory.reduce((s, r) => s + r.balance, 0);
    const vendorExpenses = await this.getVendorExpenses(dateFrom, dateTo);
    const monthlyExpenses = await this.getMonthlyTotals(dateFrom, dateTo, 'expense', 'debit');

    return {
      period: { from: dateFrom, to: dateTo },
      byCategory: byCategory.map(r => ({
        category: r.name, amount: r.balance,
        percentage: total > 0 ? Math.round((r.balance / total) * 10000) / 100 : 0,
      })),
      byVendor: vendorExpenses.map(r => ({
        vendorId: r.id, vendorName: r.name, amount: r.amount,
        percentage: total > 0 ? Math.round((r.amount / total) * 10000) / 100 : 0,
      })),
      byMonth: monthlyExpenses,
      total,
    };
  }

  async getRevenueAnalytics(dateFrom: string, dateTo: string): Promise<RevenueAnalytics> {
    const revenueAccounts = await this.getAccountBalances(['revenue'], dateTo, dateFrom);
    const total = revenueAccounts.reduce((s, r) => s + r.balance, 0);
    const byCustomer = await this.getCustomerRevenue(dateFrom, dateTo);
    const byMonth = await this.getMonthlyTotals(dateFrom, dateTo, 'revenue', 'credit');

    return {
      period: { from: dateFrom, to: dateTo },
      byCustomer: byCustomer.map(r => ({
        customerId: r.id, customerName: r.name, amount: r.amount,
        percentage: total > 0 ? Math.round((r.amount / total) * 10000) / 100 : 0,
      })),
      byMonth,
      total,
    };
  }

  async getComparisonReport(
    _type: 'mom' | 'yoy' | 'budget_vs_actual',
    dateFrom: string,
    dateTo: string,
  ): Promise<ComparisonReport> {
    const months = this.getMonthsBetween(dateFrom, dateTo);
    const periods = months.map(m => m.label);
    const revenue: number[] = [];
    const cogs: number[] = [];
    const grossProfit: number[] = [];
    const opex: number[] = [];
    const operatingProfit: number[] = [];
    const netProfit: number[] = [];

    for (const m of months) {
      const pnl = await this.getProfitAndLoss(m.start, m.end);
      revenue.push(pnl.totalRevenue);
      cogs.push(pnl.totalCogs);
      grossProfit.push(pnl.grossProfit);
      opex.push(pnl.totalOperatingExpenses);
      operatingProfit.push(pnl.operatingProfit);
      netProfit.push(pnl.netProfit);
    }

    return {
      periods,
      rows: [
        { label: 'Revenue', values: revenue },
        { label: 'COGS', values: cogs },
        { label: 'Gross Profit', values: grossProfit },
        { label: 'Operating Expenses', values: opex },
        { label: 'Operating Profit', values: operatingProfit },
        { label: 'Net Profit', values: netProfit },
      ],
    };
  }

  async getCashFlowForecast(days: number): Promise<CashFlowForecast> {
    const today = new Date().toISOString().split('T')[0]!;
    const currentBalance = await this.getCashBalance();
    const past90 = new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0]!;
    const cashFlow = await this.getCashFlowStatement(past90, today);
    const avgDailyFlow = cashFlow.netChange / 90;

    const projections = this.buildProjections(days, currentBalance, avgDailyFlow);

    return {
      projections, currentBalance,
      projectedBalance30d: Math.round((currentBalance + avgDailyFlow * 30) * 100) / 100,
      projectedBalance60d: Math.round((currentBalance + avgDailyFlow * 60) * 100) / 100,
      projectedBalance90d: Math.round((currentBalance + avgDailyFlow * 90) * 100) / 100,
    };
  }

  // --- Private helpers ---

  private async getAccountBalances(
    types: string[],
    dateTo: string,
    dateFrom?: string,
  ): Promise<AccountRow[]> {
    const typeLiteral = types.map(t => `'${t}'`).join(',');
    const dateConditions = dateFrom
      ? [gte(journalEntries.date, dateFrom), lte(journalEntries.date, dateTo)]
      : [lte(journalEntries.date, dateTo)];

    const rows = await this.db
      .select({
        code: accounts.code, name: accounts.name, type: accounts.type,
        totalDebit: sum(journalLines.debit), totalCredit: sum(journalLines.credit),
      })
      .from(accounts)
      .innerJoin(journalLines, eq(journalLines.accountId, accounts.id))
      .innerJoin(journalEntries, and(eq(journalLines.journalEntryId, journalEntries.id), ...dateConditions))
      .where(and(
        eq(accounts.tenantId, this.tenantId),
        sql`${accounts.type} = ANY(ARRAY[${sql.raw(typeLiteral)}]::account_type[])`,
      ))
      .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
      .orderBy(accounts.code);

    return rows
      .map(r => {
        const dr = toNumber(r.totalDebit ?? '0');
        const cr = toNumber(r.totalCredit ?? '0');
        const isDebitNormal = r.type === 'asset' || r.type === 'expense';
        return { code: r.code, name: r.name, type: r.type, balance: isDebitNormal ? dr - cr : cr - dr };
      })
      .filter(r => Math.abs(r.balance) > 0.001);
  }

  private toLineItems(rows: AccountRow[], type: string) {
    return rows
      .filter(r => r.type === type)
      .map(r => ({ accountCode: r.code, accountName: r.name, amount: r.balance }));
  }

  private async getCashBalance(): Promise<number> {
    const [result] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${bankAccounts.currentBalance}), 0)::text` })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true)));
    return toNumber(result?.total ?? '0');
  }

  private async getCashBalanceAsOf(asOfDate: string): Promise<number> {
    // Sum of bank opening balances + all cash JE movements before the date
    const [openingResult] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${bankAccounts.openingBalance}), 0)::text` })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true)));
    const openingBalance = toNumber(openingResult?.total ?? '0');

    const [movementResult] = await this.db
      .select({
        totalDebit: sum(journalLines.debit),
        totalCredit: sum(journalLines.credit),
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(
        eq(journalLines.tenantId, this.tenantId),
        sql`${accounts.code} IN ('1101', '1102')`,
        sql`${journalEntries.date} < ${asOfDate}`,
      ));

    const dr = toNumber(movementResult?.totalDebit ?? '0');
    const cr = toNumber(movementResult?.totalCredit ?? '0');
    return openingBalance + dr - cr;
  }

  private async getCashJournalEntries(dateFrom: string, dateTo: string) {
    // Only actual cash/bank accounts (1101, 1102), not AR (1103) or other 11xx
    return this.db
      .select({
        sourceType: journalEntries.sourceType,
        totalDebit: sum(journalLines.debit),
        totalCredit: sum(journalLines.credit),
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(
        eq(journalLines.tenantId, this.tenantId),
        sql`${accounts.code} IN ('1101', '1102')`,
        gte(journalEntries.date, dateFrom),
        lte(journalEntries.date, dateTo),
      ))
      .groupBy(journalEntries.sourceType);
  }

  private classifyCashEntries(entries: { sourceType: string | null; totalDebit: string | null; totalCredit: string | null }[]) {
    const operating: { description: string; amount: number }[] = [];
    const investing: { description: string; amount: number }[] = [];
    const financing: { description: string; amount: number }[] = [];

    const OPERATING = new Set(['payment', 'receipt', 'manual', 'debit_note', 'credit_note']);
    const FINANCING = new Set(['loan_disbursement', 'loan_repayment', 'equity_injection', 'dividend']);

    for (const entry of entries) {
      const net = toNumber(entry.totalDebit ?? '0') - toNumber(entry.totalCredit ?? '0');
      if (Math.abs(net) < 0.01) continue;
      const desc = this.sourceTypeLabel(entry.sourceType);
      const type = entry.sourceType ?? '';

      if (OPERATING.has(type)) {
        operating.push({ description: desc, amount: net });
      } else if (FINANCING.has(type)) {
        financing.push({ description: desc, amount: net });
      } else {
        investing.push({ description: desc, amount: net });
      }
    }
    return { operating, investing, financing };
  }

  private async getVendorExpenses(dateFrom: string, dateTo: string) {
    const rows = await this.db
      .select({
        id: purchaseInvoices.vendorId,
        name: vendors.name,
        amount: sql<string>`COALESCE(SUM(${purchaseInvoices.totalAmount}), 0)::text`,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        gte(purchaseInvoices.invoiceDate, dateFrom),
        lte(purchaseInvoices.invoiceDate, dateTo),
      ))
      .groupBy(purchaseInvoices.vendorId, vendors.name)
      .orderBy(sql`SUM(${purchaseInvoices.totalAmount}) DESC`);

    return rows.map(r => ({ id: r.id, name: r.name, amount: toNumber(r.amount) }));
  }

  private async getCustomerRevenue(dateFrom: string, dateTo: string) {
    const rows = await this.db
      .select({
        id: salesInvoices.customerId,
        name: customers.name,
        amount: sql<string>`COALESCE(SUM(${salesInvoices.totalAmount}), 0)::text`,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, dateFrom),
        lte(salesInvoices.invoiceDate, dateTo),
      ))
      .groupBy(salesInvoices.customerId, customers.name)
      .orderBy(sql`SUM(${salesInvoices.totalAmount}) DESC`);

    return rows.map(r => ({ id: r.id, name: r.name, amount: toNumber(r.amount) }));
  }

  private async getMonthlyTotals(
    dateFrom: string,
    dateTo: string,
    accountType: string,
    side: 'debit' | 'credit',
  ): Promise<{ month: string; amount: number }[]> {
    const col = side === 'debit' ? journalLines.debit : journalLines.credit;
    const rows = await this.db
      .select({
        month: sql<string>`TO_CHAR(${journalEntries.date}::date, 'YYYY-MM')`,
        amount: sql<string>`COALESCE(SUM(${col}), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(
        eq(journalLines.tenantId, this.tenantId),
        sql`${accounts.type} = ${accountType}::account_type`,
        gte(journalEntries.date, dateFrom),
        lte(journalEntries.date, dateTo),
      ))
      .groupBy(sql`TO_CHAR(${journalEntries.date}::date, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${journalEntries.date}::date, 'YYYY-MM')`);

    return rows.map(r => ({ month: r.month, amount: toNumber(r.amount) }));
  }

  private buildProjections(days: number, currentBalance: number, avgDailyFlow: number) {
    const projections: { date: string; projected: number; confidence: number }[] = [];
    let balance = currentBalance;
    const step = days <= 90 ? 1 : 7;

    for (let d = 1; d <= days; d += step) {
      const date = new Date(Date.now() + d * 86400_000).toISOString().split('T')[0]!;
      balance += avgDailyFlow * step;
      const confidence = Math.max(0.5, 1 - (d / days) * 0.5);
      projections.push({ date, projected: Math.round(balance * 100) / 100, confidence });
    }
    return projections;
  }

  private sourceTypeLabel(sourceType: string | null): string {
    const labels: Record<string, string> = {
      payment: 'Vendor Payments',
      receipt: 'Customer Receipts',
      purchase_invoice: 'Purchase Invoices',
      sales_invoice: 'Sales Invoices',
      manual: 'Adjustments & Accruals',
      debit_note: 'Debit Note Adjustments',
      credit_note: 'Credit Note Adjustments',
      loan_disbursement: 'Loan Disbursements',
      loan_repayment: 'Loan Repayments',
    };
    return labels[sourceType ?? ''] ?? (sourceType ?? 'Other');
  }

  private getMonthsBetween(dateFrom: string, dateTo: string) {
    const months: { label: string; start: string; end: string }[] = [];
    const end = new Date(dateTo);
    const cursor = new Date(new Date(dateFrom).getFullYear(), new Date(dateFrom).getMonth(), 1);

    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const monthStart = new Date(y, m, 1).toISOString().split('T')[0]!;
      const monthEnd = new Date(y, m + 1, 0).toISOString().split('T')[0]!;
      const label = cursor.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
      months.push({ label, start: monthStart, end: monthEnd });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }
}

export interface PnLLineItem {
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface ProfitAndLoss {
  period: { from: string; to: string };
  revenue: PnLLineItem[];
  totalRevenue: number;
  cogs: PnLLineItem[];
  totalCogs: number;
  grossProfit: number;
  operatingExpenses: PnLLineItem[];
  totalOperatingExpenses: number;
  operatingProfit: number;
  depreciation: PnLLineItem[];
  totalDepreciation: number;
  financialCosts: PnLLineItem[];
  totalFinancialCosts: number;
  profitBeforeTax: number;
  taxes: PnLLineItem[];
  totalTaxes: number;
  netProfit: number;
}

export interface BalanceSheet {
  asOfDate: string;
  assets: { accountCode: string; accountName: string; amount: number }[];
  totalAssets: number;
  liabilities: { accountCode: string; accountName: string; amount: number }[];
  totalLiabilities: number;
  equity: { accountCode: string; accountName: string; amount: number }[];
  totalEquity: number;
}

export interface CashFlowStatement {
  period: { from: string; to: string };
  operating: { description: string; amount: number }[];
  totalOperating: number;
  investing: { description: string; amount: number }[];
  totalInvesting: number;
  financing: { description: string; amount: number }[];
  totalFinancing: number;
  netChange: number;
  openingBalance: number;
  closingBalance: number;
}

export interface ExpenseAnalytics {
  period: { from: string; to: string };
  byCategory: { category: string; amount: number; percentage: number }[];
  byVendor: {
    vendorId: string;
    vendorName: string;
    amount: number;
    percentage: number;
  }[];
  byMonth: { month: string; amount: number }[];
  total: number;
}

export interface RevenueAnalytics {
  period: { from: string; to: string };
  byCustomer: {
    customerId: string;
    customerName: string;
    amount: number;
    percentage: number;
  }[];
  byMonth: { month: string; amount: number }[];
  total: number;
}

export interface ComparisonReport {
  periods: string[];
  rows: { label: string; values: number[] }[];
}

export interface CashFlowForecast {
  projections: { date: string; projected: number; confidence: number }[];
  currentBalance: number;
  projectedBalance30d: number;
  projectedBalance60d: number;
  projectedBalance90d: number;
}

/** One row of the monthly P&L: an amount per month plus the period total. */
export interface MonthlyPnlRow {
  key: string;
  label: string;
  values: number[];
  total: number;
}

export interface MonthlyPnlSection {
  key: 'revenue' | 'expenses' | 'nonOperating';
  label: string;
  lines: MonthlyPnlRow[];
  totals: MonthlyPnlRow;
}

/**
 * Management P&L, month by month. Milk is costed by pour date (bulk VMCC milk
 * by its billing cycle); everything else by its accounting date. Stock
 * movements are left out (purchases are expensed when bought) and capital
 * items sit below operating profit. Amounts are positive; sections say
 * whether they add or subtract.
 */
export interface MonthlyPnl {
  period: { from: string; to: string };
  months: string[];
  sections: MonthlyPnlSection[];
  operatingProfit: MonthlyPnlRow;
  netProfit: MonthlyPnlRow;
  /** Profit taken out through entries booked as expenses (marked by the owner). */
  profitBookedAsExpense: MonthlyPnlRow;
  /** Net profit less what was booked as expense — what the official books show. */
  profitRetained: MonthlyPnlRow;
  /** Stock postings (COGS, write-offs, stock gains) left out of the figures above. */
  excludedStock: MonthlyPnlRow;
  /** Months whose milk cost is incomplete because a payout cycle is not billed yet. */
  provisionalMonths: string[];
}

/** One source entry behind a monthly P&L figure. */
export interface MonthlyPnlEntry {
  /** Set on ledger entries: the (journal entry, account) pair a profit mark points at. */
  ref: { journalEntryId: string; accountId: string } | null;
  /** An expense entry that can be marked as profit taken out (or unmarked). */
  markable: boolean;
  date: string;
  description: string;
  /** Who was paid (or who paid us): vendor, customer, farmer, VMCC payee. */
  party: string | null;
  /** True when [party] was read off the bank narration rather than a linked record. */
  partyFromBank: boolean;
  /** Where it came from: a journal source (bank payment, bill, payroll…) or MP pours / VMCC bill. */
  source: string;
  account: string;
  amount: number;
}

export interface MonthlyPnlLineDetail {
  key: string;
  label: string;
  /** Column heading for [MonthlyPnlEntry.party]: "Paid to" for costs, "Received from" for income. */
  partyLabel: string;
  period: { from: string; to: string };
  total: number;
  entries: MonthlyPnlEntry[];
}

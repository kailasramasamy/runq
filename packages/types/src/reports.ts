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

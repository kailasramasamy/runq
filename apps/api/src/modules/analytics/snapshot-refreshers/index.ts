import { registerRefresher } from '../refresh-registry';
import { arAgingRefresher, apAgingRefresher } from './aging';
import { topOverdueCustomersRefresher } from './top-overdue-customers';
import { topVendorsBySpendRefresher } from './top-vendors-by-spend';
import { topExpenseCategoriesRefresher } from './top-expense-categories';
import { revenueVsExpense12moRefresher } from './revenue-vs-expense-12mo';
import { bankBalanceTrend90dRefresher } from './bank-balance-trend-90d';
import { dsoTrend6moRefresher } from './dso-trend-6mo';

let registered = false;

export function registerAllRefreshers(): void {
  if (registered) return;
  registered = true;
  registerRefresher(arAgingRefresher);
  registerRefresher(apAgingRefresher);
  registerRefresher(topOverdueCustomersRefresher);
  registerRefresher(topVendorsBySpendRefresher);
  registerRefresher(topExpenseCategoriesRefresher);
  registerRefresher(revenueVsExpense12moRefresher);
  registerRefresher(bankBalanceTrend90dRefresher);
  registerRefresher(dsoTrend6moRefresher);
}

export type { AgingPayload, AgingBucket } from './aging';
export type { TopOverdueCustomersPayload, OverdueCustomerRow } from './top-overdue-customers';
export type { TopVendorsBySpendPayload, VendorSpendRow } from './top-vendors-by-spend';
export type { TopExpenseCategoriesPayload, ExpenseCategoryRow } from './top-expense-categories';
export type { RevenueVsExpense12moPayload, RevExpMonth } from './revenue-vs-expense-12mo';
export type { BankBalanceTrend90dPayload, BankBalanceAccount, BankBalancePoint } from './bank-balance-trend-90d';
export type { DsoTrend6moPayload, DsoPoint } from './dso-trend-6mo';

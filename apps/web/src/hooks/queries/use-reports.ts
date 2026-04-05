import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ProfitAndLoss, BalanceSheet, CashFlowStatement, ExpenseAnalytics, RevenueAnalytics, ComparisonReport, CashFlowForecast, ApiSuccess } from '@runq/types';

const REPORT_KEYS = {
  pnl: (dateFrom?: string, dateTo?: string) => ['reports', 'pnl', dateFrom, dateTo] as const,
  balanceSheet: (asOfDate?: string) => ['reports', 'balance-sheet', asOfDate] as const,
  cashFlow: (dateFrom?: string, dateTo?: string) => ['reports', 'cash-flow', dateFrom, dateTo] as const,
  expenseAnalytics: (dateFrom?: string, dateTo?: string) => ['reports', 'expense-analytics', dateFrom, dateTo] as const,
  revenueAnalytics: (dateFrom?: string, dateTo?: string) => ['reports', 'revenue-analytics', dateFrom, dateTo] as const,
  comparison: (type?: string, dateFrom?: string, dateTo?: string) => ['reports', 'comparison', type, dateFrom, dateTo] as const,
  forecast: (days?: number) => ['reports', 'forecast', days] as const,
};

export function useProfitAndLoss(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: REPORT_KEYS.pnl(dateFrom, dateTo),
    queryFn: () => api.get<ApiSuccess<ProfitAndLoss>>(`/reports/profit-and-loss?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    enabled: !!dateFrom && !!dateTo,
  });
}

export function useBalanceSheet(asOfDate?: string) {
  const qs = asOfDate ? `?asOfDate=${asOfDate}` : '';
  return useQuery({
    queryKey: REPORT_KEYS.balanceSheet(asOfDate),
    queryFn: () => api.get<ApiSuccess<BalanceSheet>>(`/reports/balance-sheet${qs}`),
  });
}

export function useCashFlowStatement(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: REPORT_KEYS.cashFlow(dateFrom, dateTo),
    queryFn: () => api.get<ApiSuccess<CashFlowStatement>>(`/reports/cash-flow?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    enabled: !!dateFrom && !!dateTo,
  });
}

export function useExpenseAnalytics(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: REPORT_KEYS.expenseAnalytics(dateFrom, dateTo),
    queryFn: () => api.get<ApiSuccess<ExpenseAnalytics>>(`/reports/expense-analytics?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    enabled: !!dateFrom && !!dateTo,
  });
}

export function useRevenueAnalytics(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: REPORT_KEYS.revenueAnalytics(dateFrom, dateTo),
    queryFn: () => api.get<ApiSuccess<RevenueAnalytics>>(`/reports/revenue-analytics?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    enabled: !!dateFrom && !!dateTo,
  });
}

export function useComparisonReport(type: 'mom' | 'yoy' | 'budget_vs_actual', dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: REPORT_KEYS.comparison(type, dateFrom, dateTo),
    queryFn: () => api.get<ApiSuccess<ComparisonReport>>(`/reports/comparison?type=${type}&dateFrom=${dateFrom}&dateTo=${dateTo}`),
    enabled: !!dateFrom && !!dateTo,
  });
}

export function useCashFlowForecast(days = 90) {
  return useQuery({
    queryKey: REPORT_KEYS.forecast(days),
    queryFn: () => api.get<ApiSuccess<CashFlowForecast>>(`/reports/cash-flow-forecast?days=${days}`),
  });
}

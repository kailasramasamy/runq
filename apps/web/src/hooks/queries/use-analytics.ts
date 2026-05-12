import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export interface CashPosition {
  total: number;
  byAccount: Array<{ accountId: string; accountName: string; balance: number; asOf: string | null }>;
  asOf: string;
}
export interface OutstandingTotal { total: number; invoiceCount: number }
export interface SalesMtd {
  amount: number; count: number;
  prevAmount: number; prevCount: number;
  monthStart: string;
}
export interface BillsDueWeek {
  items: Array<{ id: string; invoiceNumber: string; vendorId: string; vendorName: string; dueDate: string; balanceDue: number }>;
  totalAmount: number;
}

const KEYS = {
  cashPosition: ['analytics', 'cash-position'] as const,
  arOutstanding: ['analytics', 'ar-outstanding'] as const,
  apOutstanding: ['analytics', 'ap-outstanding'] as const,
  salesMtd: ['analytics', 'sales-mtd'] as const,
  billsDueWeek: ['analytics', 'bills-due-week'] as const,
};

export function useCashPosition() {
  return useQuery({
    queryKey: KEYS.cashPosition,
    queryFn: async () => (await api.get<{ data: CashPosition }>('/analytics/cash-position')).data,
    staleTime: 60_000,
  });
}

export function useArOutstanding() {
  return useQuery({
    queryKey: KEYS.arOutstanding,
    queryFn: async () => (await api.get<{ data: OutstandingTotal }>('/analytics/ar-outstanding')).data,
    staleTime: 60_000,
  });
}

export function useApOutstanding() {
  return useQuery({
    queryKey: KEYS.apOutstanding,
    queryFn: async () => (await api.get<{ data: OutstandingTotal }>('/analytics/ap-outstanding')).data,
    staleTime: 60_000,
  });
}

export function useSalesMtd() {
  return useQuery({
    queryKey: KEYS.salesMtd,
    queryFn: async () => (await api.get<{ data: SalesMtd }>('/analytics/sales-mtd')).data,
    staleTime: 60_000,
  });
}

export function useBillsDueWeek() {
  return useQuery({
    queryKey: KEYS.billsDueWeek,
    queryFn: async () => (await api.get<{ data: BillsDueWeek }>('/analytics/bills-due-week')).data,
    staleTime: 60_000,
  });
}

export interface CashForecastWindow {
  inflow: number; outflow: number; net: number;
  receivableCount: number; payableCount: number;
}
export interface CashForecast {
  asOf: string;
  cashOnHand: number;
  next7d: CashForecastWindow;
  next30d: CashForecastWindow;
  projectedAt7d: number;
  projectedAt30d: number;
}
export function useCashForecast() {
  return useQuery({
    queryKey: ['analytics', 'cash-forecast'] as const,
    queryFn: async () => (await api.get<{ data: CashForecast }>('/analytics/cash-forecast')).data,
    staleTime: 60_000,
  });
}

// ─── Phase 1B step 1 — snapshot-backed metrics ──────────────────────────

export interface AgingBucket { key: '0-30' | '31-60' | '61-90' | '90+'; amount: number; count: number }
export interface AgingPayload { buckets: AgingBucket[]; total: number; totalCount: number }
export interface OverdueCustomer { customerId: string; customerName: string; balanceDue: number; invoiceCount: number; maxDaysOverdue: number }
export interface TopOverdueCustomers { items: OverdueCustomer[]; totalAmount: number }
export interface VendorSpend { vendorId: string; vendorName: string; totalSpend: number; billCount: number }
export interface TopVendorsBySpend { items: VendorSpend[]; totalAmount: number; windowDays: number }
export interface ExpenseCategory { accountId: string; accountCode: string; accountName: string; amount: number }
export interface TopExpenseCategories { items: ExpenseCategory[]; totalAmount: number; monthStart: string }

interface SnapshotEnvelope<T> { data: T | null; computedAt: string | null }

function snapshotQuery<T>(path: string, key: readonly unknown[]) {
  return () => useQuery({
    queryKey: key,
    queryFn: async () => api.get<SnapshotEnvelope<T>>(path),
    staleTime: 5 * 60_000,
  });
}

export const useArAging              = snapshotQuery<AgingPayload>('/analytics/ar-aging',                  ['analytics', 'ar-aging'] as const);
export const useApAging              = snapshotQuery<AgingPayload>('/analytics/ap-aging',                  ['analytics', 'ap-aging'] as const);
export const useTopOverdueCustomers  = snapshotQuery<TopOverdueCustomers>('/analytics/top-overdue-customers', ['analytics', 'top-overdue-customers'] as const);
export const useTopVendorsBySpend    = snapshotQuery<TopVendorsBySpend>('/analytics/top-vendors-by-spend',    ['analytics', 'top-vendors-by-spend'] as const);
export const useTopExpenseCategories = snapshotQuery<TopExpenseCategories>('/analytics/top-expense-categories',['analytics', 'top-expense-categories'] as const);

// ─── Phase 1B step 2 — trend metrics ───────────────────────────────────

export interface RevExpMonth { month: string; revenue: number; expense: number }
export interface RevenueVsExpense12mo { months: RevExpMonth[]; totalRevenue: number; totalExpense: number }
export interface BankBalancePoint { date: string; balance: number }
export interface BankBalanceAccount { accountId: string; accountName: string; points: BankBalancePoint[] }
export interface BankBalanceTrend90d { accounts: BankBalanceAccount[]; totalSeries: BankBalancePoint[] }
export interface DsoPoint { month: string; dso: number | null; arBalance: number; sales: number; daysInMonth: number }
export interface DsoTrend6mo { months: DsoPoint[]; latestDso: number | null; averageDso: number | null }

export const useRevenueVsExpense12mo = snapshotQuery<RevenueVsExpense12mo>('/analytics/revenue-vs-expense-12mo', ['analytics', 'revenue-vs-expense-12mo'] as const);
export const useBankBalanceTrend90d  = snapshotQuery<BankBalanceTrend90d>('/analytics/bank-balance-trend-90d',   ['analytics', 'bank-balance-trend-90d'] as const);
export const useDsoTrend6mo          = snapshotQuery<DsoTrend6mo>('/analytics/dso-trend-6mo',                    ['analytics', 'dso-trend-6mo'] as const);

// ─── Phase 1C — heavy report summaries ────────────────────────────────

export type PnlPeriod = 'fy' | 'qtr' | 'month';
export interface PnlSummary {
  periodKind: PnlPeriod;
  period: { from: string; to: string };
  totalRevenue: number;
  totalExpense: number;
  grossProfit: number;
  netProfit: number;
  prior: {
    period: { from: string; to: string };
    totalRevenue: number;
    totalExpense: number;
    netProfit: number;
  };
  netProfitDeltaPct: number | null;
}
export interface BsSummary { asOfDate: string; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean }
export interface TbSummary { asOfDate: string; accountCount: number; totalDebit: number; totalCredit: number; balanced: boolean }
export interface UnreconciledBankTxns {
  total: number; count: number;
  byAccount: Array<{ accountId: string; accountName: string; count: number; amount: number }>;
}

export function usePnlSummary(period: PnlPeriod = 'fy') {
  return useQuery({
    queryKey: ['analytics', 'pnl-summary', period] as const,
    queryFn: async () => (await api.get<{ data: PnlSummary }>(`/analytics/pnl-summary?period=${period}`)).data,
    staleTime: 5 * 60_000,
  });
}
export function useBsSummary() {
  return useQuery({
    queryKey: ['analytics', 'bs-summary'] as const,
    queryFn: async () => (await api.get<{ data: BsSummary }>('/analytics/bs-summary')).data,
    staleTime: 5 * 60_000,
  });
}
export function useTrialBalanceSummary() {
  return useQuery({
    queryKey: ['analytics', 'trial-balance-summary'] as const,
    queryFn: async () => (await api.get<{ data: TbSummary }>('/analytics/trial-balance-summary')).data,
    staleTime: 5 * 60_000,
  });
}
export function useUnreconciledBankTxns() {
  return useQuery({
    queryKey: ['analytics', 'unreconciled-bank-txns'] as const,
    queryFn: async () => (await api.get<{ data: UnreconciledBankTxns }>('/analytics/unreconciled-bank-txns')).data,
    staleTime: 60_000,
  });
}

export interface SuspenseAccount {
  accountId: string; accountCode: string; accountName: string;
  balance: number; lineCount: number;
}
export interface SuspenseSummary {
  asOf: string;
  accounts: SuspenseAccount[];
  totalAbsBalance: number;
  totalStuck: number;
  clean: boolean;
}
export interface PendingApprovalsBreakdown {
  entityType: string; count: number; oldestRequestedAt: string | null;
}
export interface PendingApprovalsSummary {
  total: number;
  byEntityType: PendingApprovalsBreakdown[];
}

export function useSuspenseSummary() {
  return useQuery({
    queryKey: ['analytics', 'suspense-summary'] as const,
    queryFn: async () => (await api.get<{ data: SuspenseSummary }>('/analytics/suspense-summary')).data,
    staleTime: 5 * 60_000,
  });
}
export interface SendReminderResult {
  invoiceCount: number;
  channel: 'email' | 'sms' | 'whatsapp';
  logged: number;
  queued: number;
}

export function useSendOverdueReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customerId: string; channel?: 'email' | 'sms' | 'whatsapp' }) =>
      (await api.post<{ data: SendReminderResult }>(
        `/analytics/customers/${input.customerId}/send-reminder`,
        { channel: input.channel ?? 'email' },
      )).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics', 'top-overdue-customers'] });
    },
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['analytics', 'pending-approvals'] as const,
    queryFn: async () => (await api.get<{ data: PendingApprovalsSummary }>('/analytics/pending-approvals')).data,
    staleTime: 60_000,
  });
}

// ─── Phase 2 — GST summaries ──────────────────────────────────────────

export interface GstPeriod { period: string; label: string; monthStart: string; monthEnd: string }
export interface Gstr1Vs3bSummary {
  period: GstPeriod;
  gstr1Available: boolean;
  gstr3bAvailable: boolean;
  outwardTaxableValueDelta: number;
  totalTaxDelta: number;
  hasMismatch: boolean;
  details: Array<{ label: string; gstr1: number; gstr3b: number; delta: number }>;
}
export interface Gstr2bReconSummary {
  period: GstPeriod;
  has2b: boolean;
  reconRun: boolean;
  matched: { count: number; taxableValue: number };
  mismatched: { count: number; taxableValue: number };
  notInBooks: { count: number; taxableValue: number };
  notIn2b: { count: number; taxableValue: number };
  totalItcAvailable: number;
  totalItcClaimable: number;
  itcAtRisk: number;
}
export interface GstLiabilityCurrent {
  period: GstPeriod;
  has3b: boolean;
  igst: number; cgst: number; sgst: number; cess: number;
  totalPayable: number;
  totalItcUsed: number;
  totalCashPayable: number;
}
export interface ItcBlockerVendor {
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  billCount: number;
  itcAtRisk: number;
  reason: 'missing_in_2b' | 'no_gstin';
}
export interface VendorsNotFiledSummary {
  period: GstPeriod;
  has2b: boolean;
  vendors: ItcBlockerVendor[];
  totalItcAtRisk: number;
}

export function useGstr1Vs3b() {
  return useQuery({
    queryKey: ['analytics', 'gst', 'gstr1-vs-3b'] as const,
    queryFn: async () => (await api.get<{ data: Gstr1Vs3bSummary }>('/analytics/gst/gstr1-vs-3b')).data,
    staleTime: 5 * 60_000,
  });
}
export function useGstr2bRecon() {
  return useQuery({
    queryKey: ['analytics', 'gst', '2b-recon'] as const,
    queryFn: async () => (await api.get<{ data: Gstr2bReconSummary }>('/analytics/gst/2b-recon')).data,
    staleTime: 5 * 60_000,
  });
}
export function useGstLiability() {
  return useQuery({
    queryKey: ['analytics', 'gst', 'liability-current'] as const,
    queryFn: async () => (await api.get<{ data: GstLiabilityCurrent }>('/analytics/gst/liability-current')).data,
    staleTime: 5 * 60_000,
  });
}
export function useVendorsNotFiled() {
  return useQuery({
    queryKey: ['analytics', 'gst', 'vendors-not-filed'] as const,
    queryFn: async () => (await api.get<{ data: VendorsNotFiledSummary }>('/analytics/gst/vendors-not-filed')).data,
    staleTime: 5 * 60_000,
  });
}

// ─── Phase 3 — Profitability & cash ───────────────────────────────────

export interface CashRunway { cashOnHand: number; netBurn30d: number; monthlyBurn: number; runwayMonths: number | null; asOf: string }
export interface GrossMargin { period: { from: string; to: string }; revenue: number; cogs: number; grossProfit: number; marginPct: number | null }
export interface CashFlowSummary { period: { from: string; to: string }; operating: number; investing: number; financing: number; netChange: number; openingBalance: number; closingBalance: number }

export function useCashRunway() {
  return useQuery({
    queryKey: ['analytics', 'cash-runway'] as const,
    queryFn: async () => (await api.get<{ data: CashRunway }>('/analytics/cash-runway')).data,
    staleTime: 5 * 60_000,
  });
}
export function useGrossMargin() {
  return useQuery({
    queryKey: ['analytics', 'gross-margin'] as const,
    queryFn: async () => (await api.get<{ data: GrossMargin }>('/analytics/gross-margin')).data,
    staleTime: 5 * 60_000,
  });
}
export function useCashFlowSummary() {
  return useQuery({
    queryKey: ['analytics', 'cash-flow-summary'] as const,
    queryFn: async () => (await api.get<{ data: CashFlowSummary }>('/analytics/cash-flow-summary')).data,
    staleTime: 5 * 60_000,
  });
}

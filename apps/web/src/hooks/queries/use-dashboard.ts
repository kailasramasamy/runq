import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export interface DashboardSummary {
  outstandingPayables: number;
  outstandingReceivables: number;
  cashPosition: number;
  overdueCount: number;
  overdueAmount: number;
  upcomingCount: number;
  upcomingAmount: number;
  // Phase 1: real burn / revenue numbers from books.
  netBurn30d: number;
  netBurnDeltaPct: number | null;
  runwayMonths: number | null;
  burnSpark: number[];
  revenueMtd: number;
  revenueDeltaPct: number | null;
  revenuePriorMonthTotal: number;
  revenueSpark: number[];
  receivablesDeltaPct: number | null;
  payablesDeltaPct: number | null;
}

export interface AgingBucket {
  label: string;
  amount: number;
}

export interface AgingData {
  buckets: AgingBucket[];
  total: number;
}

interface RawSummary {
  totalOutstandingPayables: string;
  totalOutstandingReceivables: string;
  cashPosition: string;
  overdue: {
    payables: { count: number; amount: string };
    receivables: { count: number; amount: string };
  };
  upcomingPayments7Days: { count: number; amount: string };
  netBurn30d?: string;
  netBurnDeltaPct?: number | null;
  runwayMonths?: number | null;
  burnSpark?: number[];
  revenueMtd?: string;
  revenueDeltaPct?: number | null;
  revenuePriorMonthTotal?: string;
  revenueSpark?: number[];
  receivablesDeltaPct?: number | null;
  payablesDeltaPct?: number | null;
}

interface RawAging {
  current: { count: number; amount: string };
  days1to30: { count: number; amount: string };
  days31to60: { count: number; amount: string };
  days61to90: { count: number; amount: string };
  days90plus: { count: number; amount: string };
}

function parseSummary(raw: RawSummary): DashboardSummary {
  return {
    outstandingPayables: parseFloat(raw.totalOutstandingPayables) || 0,
    outstandingReceivables: parseFloat(raw.totalOutstandingReceivables) || 0,
    cashPosition: parseFloat(raw.cashPosition) || 0,
    overdueCount: (raw.overdue?.payables?.count ?? 0) + (raw.overdue?.receivables?.count ?? 0),
    overdueAmount: (parseFloat(raw.overdue?.payables?.amount) || 0) + (parseFloat(raw.overdue?.receivables?.amount) || 0),
    upcomingCount: raw.upcomingPayments7Days?.count ?? 0,
    upcomingAmount: parseFloat(raw.upcomingPayments7Days?.amount) || 0,
    netBurn30d: parseFloat(raw.netBurn30d ?? '0') || 0,
    netBurnDeltaPct: raw.netBurnDeltaPct ?? null,
    runwayMonths: raw.runwayMonths ?? null,
    burnSpark: raw.burnSpark ?? [],
    revenueMtd: parseFloat(raw.revenueMtd ?? '0') || 0,
    revenueDeltaPct: raw.revenueDeltaPct ?? null,
    revenuePriorMonthTotal: parseFloat(raw.revenuePriorMonthTotal ?? '0') || 0,
    revenueSpark: raw.revenueSpark ?? [],
    receivablesDeltaPct: raw.receivablesDeltaPct ?? null,
    payablesDeltaPct: raw.payablesDeltaPct ?? null,
  };
}

function parseAging(raw: RawAging): AgingData {
  const buckets: AgingBucket[] = [
    { label: 'Current', amount: parseFloat(raw.current?.amount) || 0 },
    { label: '1–30 days', amount: parseFloat(raw.days1to30?.amount) || 0 },
    { label: '31–60 days', amount: parseFloat(raw.days31to60?.amount) || 0 },
    { label: '61–90 days', amount: parseFloat(raw.days61to90?.amount) || 0 },
    { label: '90+ days', amount: parseFloat(raw.days90plus?.amount) || 0 },
  ];
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  return { buckets, total };
}

const DASHBOARD_KEYS = {
  summary: ['dashboard', 'summary'] as const,
  payablesAging: ['dashboard', 'payables-aging'] as const,
  receivablesAging: ['dashboard', 'receivables-aging'] as const,
  bankBalances: ['dashboard', 'bank-balances'] as const,
  cashTrend: (days: number) => ['dashboard', 'cash-trend', days] as const,
  activity: (limit: number) => ['dashboard', 'activity', limit] as const,
  aiSummary: ['dashboard', 'ai-summary'] as const,
};

export interface BankBalance {
  id: string;
  name: string;
  bankName: string;
  accountType: string;
  currentBalance: string;
}
interface RawBankBalances {
  accounts: BankBalance[];
  total: string;
}

export interface CashTrend {
  cashPosition: number;
  spark: number[];
  weeklyDelta: number;
  days: number;
  asOf: string;
}
interface RawCashTrend {
  cashPosition: string;
  spark: number[];
  weeklyDelta: number;
  days: number;
  asOf: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityRef: string | null;
  amount: number | null;
  counterparty: string | null;
  userName: string | null;
  createdAt: string;
}

export interface AISummary {
  summary: string;
  generatedAt: string;
}

export interface GstReadinessSignal {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}
export type ReadinessTarget = 'gstr1' | 'gstr3b' | 'next_gstr1';

export interface GstReadinessResult {
  period: string;
  periodLabel: string;
  target: ReadinessTarget;
  targetLabel: string;
  score: number;
  signals: GstReadinessSignal[];
  returns: {
    gstr1: { exists: boolean; status: string | null };
    gstr3b: { exists: boolean; status: string | null };
  };
  dueDates: { gstr1: string; gstr3b: string };
  filedExternally?: boolean;
  filingStartLabel?: string;
  preparing?: boolean;
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.summary,
    queryFn: async () => {
      const res = await api.get<{ data: RawSummary }>('/dashboard/summary');
      return { data: parseSummary(res.data) };
    },
    staleTime: 60_000,
  });
}

export function usePayablesAging() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.payablesAging,
    queryFn: async () => {
      const res = await api.get<{ data: RawAging }>('/dashboard/payables-aging');
      return { data: parseAging(res.data) };
    },
    staleTime: 60_000,
  });
}

export function useReceivablesAging() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.receivablesAging,
    queryFn: async () => {
      const res = await api.get<{ data: RawAging }>('/dashboard/receivables-aging');
      return { data: parseAging(res.data) };
    },
    staleTime: 60_000,
  });
}

export function useBankBalances() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.bankBalances,
    queryFn: async () => {
      const res = await api.get<{ data: RawBankBalances }>('/dashboard/bank-balances');
      return {
        accounts: res.data.accounts,
        total: parseFloat(res.data.total) || 0,
      };
    },
    staleTime: 60_000,
  });
}

export function useCashTrend(days = 30) {
  return useQuery({
    queryKey: DASHBOARD_KEYS.cashTrend(days),
    queryFn: async () => {
      const res = await api.get<{ data: RawCashTrend }>(`/dashboard/cash-trend?days=${days}`);
      const r = res.data;
      const data: CashTrend = {
        cashPosition: parseFloat(r.cashPosition) || 0,
        spark: r.spark ?? [],
        weeklyDelta: r.weeklyDelta ?? 0,
        days: r.days,
        asOf: r.asOf,
      };
      return { data };
    },
    staleTime: 60_000,
  });
}

export function useDashboardActivity(limit = 20) {
  return useQuery({
    queryKey: DASHBOARD_KEYS.activity(limit),
    queryFn: async () => {
      const res = await api.get<{ data: ActivityEntry[] }>(`/dashboard/activity?limit=${limit}`);
      return { data: res.data };
    },
    staleTime: 30_000,
  });
}

export function useAISummary() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.aiSummary,
    queryFn: async () => {
      const res = await api.get<{ data: AISummary }>('/dashboard/ai-summary');
      return { data: res.data };
    },
    staleTime: 60 * 60_000, // 1h — cached server-side for 24h
  });
}

export interface CashflowMonth {
  ym: string;
  label: string;
  in: number;
  out: number;
  forecast: boolean;
}
export interface CashflowForecast {
  months: CashflowMonth[];
  inflow90: number;
  outflow90: number;
  net90: number;
}
interface RawCashflowForecast {
  months: CashflowMonth[];
  inflow90: string;
  outflow90: string;
  net90: string;
}

export function useCashflowForecast() {
  return useQuery({
    queryKey: ['dashboard', 'cashflow-forecast'] as const,
    queryFn: async () => {
      const res = await api.get<{ data: RawCashflowForecast }>('/dashboard/cashflow-forecast');
      const r = res.data;
      const data: CashflowForecast = {
        months: r.months,
        inflow90: parseFloat(r.inflow90) || 0,
        outflow90: parseFloat(r.outflow90) || 0,
        net90: parseFloat(r.net90) || 0,
      };
      return { data };
    },
    staleTime: 60_000,
  });
}

export interface PeriodCloseItem {
  key: string;
  label: string;
  status: 'done' | 'progress' | 'pending';
  sub: string;
}
export interface PeriodClose {
  periodLabel: string;
  progressPct: number;
  items: PeriodCloseItem[];
}

export function usePeriodClose() {
  return useQuery({
    queryKey: ['dashboard', 'period-close'] as const,
    queryFn: async () => {
      const res = await api.get<{ data: PeriodClose }>('/dashboard/period-close');
      return { data: res.data };
    },
    staleTime: 120_000,
  });
}

export interface AgentEvent {
  id: string;
  occurredAt: string;
  kind: string;
  severity: 'ok' | 'warn' | 'info';
  title: string;
  detail: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export function useAgentFeed(limit = 10) {
  return useQuery({
    queryKey: ['dashboard', 'agent-feed', limit] as const,
    queryFn: async () => {
      const res = await api.get<{ data: AgentEvent[] }>(`/dashboard/agent-feed?limit=${limit}`);
      return { data: res.data };
    },
    staleTime: 30_000,
  });
}

export interface Notification {
  id: string;
  type: 'info' | 'ok' | 'warn';
  source: string;
  title: string;
  body: string | null;
  targetUrl: string | null;
  unread: boolean;
  createdAt: string;
}

export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: ['dashboard', 'notifications', limit] as const,
    queryFn: async () => {
      const res = await api.get<{ data: { items: Notification[]; unread: number } }>(
        `/dashboard/notifications?limit=${limit}`,
      );
      return { data: res.data };
    },
    staleTime: 30_000,
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.put('/dashboard/notifications/mark-all-read', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', 'notifications'] }),
  });
}

export interface CurrentFy {
  currentFy: string | null;
}

export function useCurrentFy() {
  return useQuery({
    queryKey: ['settings', 'current-fy'] as const,
    queryFn: async () => {
      const res = await api.get<{ data: CurrentFy }>('/settings/current-fy');
      return { data: res.data };
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateCurrentFy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currentFy: string | null) =>
      api.put<{ data: CurrentFy }>('/settings/current-fy', { currentFy }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'current-fy'] }),
  });
}

export function useGstReadiness() {
  return useQuery({
    queryKey: ['gst', 'readiness'] as const,
    queryFn: async () => {
      const res = await api.get<{ data: GstReadinessResult }>('/gst/readiness');
      return { data: res.data };
    },
    staleTime: 120_000,
  });
}

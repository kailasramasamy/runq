import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export interface DashboardSummary {
  outstandingPayables: number;
  outstandingReceivables: number;
  cashPosition: number;
  overdueCount: number;
  overdueAmount: number;
  upcomingCount: number;
  upcomingAmount: number;
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
};

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

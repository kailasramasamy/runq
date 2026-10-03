import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export type ToPayCategory = 'bills' | 'rent_transport' | 'salaries' | 'statutory' | 'milk' | 'claims';

export type ToPayStatus = 'paid' | 'partial' | 'due';

export interface ToPayItem {
  id: string;
  category: ToPayCategory;
  title: string;
  subtitle: string;
  /** YYYY-MM-01, the month the item is for */
  period: string;
  /** Part of the month it covers ("1–15 Sep") for milk cycles / twice-monthly rent; else null. */
  subPeriod: string | null;
  subPeriodStart: string | null;
  amount: number;
  paid: number;
  balance: number;
  status: ToPayStatus;
  /** YYYY-MM-DD */
  dueDate: string;
  webLink: string;
  mobileLink: string | null;
}

export interface ToPayCategorySummary {
  key: ToPayCategory;
  label: string;
  count: number;
  paidCount: number;
  total: number;
  paid: number;
  balance: number;
  overdue: number;
}

export interface ToPay {
  scope: 'outstanding' | 'month';
  month: string | null;
  asOf: string;
  /** Sum of item amounts, including already-paid parts. */
  total: number;
  paid: number;
  /** Still owed. */
  balance: number;
  overdue: number;
  overdueCount: number;
  thisWeek: number;
  thisWeekCount: number;
  later: number;
  categories: ToPayCategorySummary[];
  items: ToPayItem[];
}

export function useToPay(month?: string) {
  return useQuery({
    queryKey: ['to-pay', month ?? 'outstanding'],
    queryFn: () => api.get<{ data: ToPay }>(month ? `/to-pay?month=${month}` : '/to-pay'),
  });
}

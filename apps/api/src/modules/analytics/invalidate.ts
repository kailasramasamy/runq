import type Redis from 'ioredis';
import { invalidate as invalidateCache } from './cache';
import { enqueueRefresh } from './scheduler';

export type AnalyticsEvent =
  | 'invoice.created' | 'invoice.updated' | 'invoice.paid' | 'invoice.deleted'
  | 'bill.created'    | 'bill.updated'    | 'bill.paid'    | 'bill.deleted'
  | 'journal.posted'  | 'journal.reversed'
  | 'bank.txn.added'  | 'bank.txn.reconciled';

const EVENT_METRIC_MAP: Record<AnalyticsEvent, string[]> = {
  'invoice.created':    ['ar_outstanding_total', 'ar_aging', 'sales_mtd', 'revenue_vs_expense_12mo'],
  'invoice.updated':    ['ar_outstanding_total', 'ar_aging'],
  'invoice.paid':       ['ar_outstanding_total', 'ar_aging', 'top_overdue_customers', 'dso_trend'],
  'invoice.deleted':    ['ar_outstanding_total', 'ar_aging', 'sales_mtd'],
  'bill.created':       ['ap_outstanding_total', 'ap_aging', 'top_vendors_by_spend', 'top_expense_categories', 'revenue_vs_expense_12mo'],
  'bill.updated':       ['ap_outstanding_total', 'ap_aging'],
  'bill.paid':          ['ap_outstanding_total', 'ap_aging', 'bills_due_this_week'],
  'bill.deleted':       ['ap_outstanding_total', 'ap_aging', 'top_expense_categories'],
  'journal.posted':     ['revenue_vs_expense_12mo', 'top_expense_categories'],
  'journal.reversed':   ['revenue_vs_expense_12mo', 'top_expense_categories'],
  'bank.txn.added':     ['cash_position', 'bank_balance_trend_90d'],
  'bank.txn.reconciled':['cash_position', 'bank_balance_trend_90d'],
};

export async function onAnalyticsEvent(
  redis: Redis,
  tenantId: string,
  event: AnalyticsEvent,
): Promise<void> {
  const metrics = EVENT_METRIC_MAP[event] ?? [];
  for (const metric of metrics) {
    await invalidateCache(redis, { tenantId, metricKey: metric });
    await enqueueRefresh(redis, tenantId, metric);
  }
}

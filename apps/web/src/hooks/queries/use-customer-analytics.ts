import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export type TrendGroupBy = 'day' | 'week' | 'month';

export interface CustomerAnalyticsSummary {
  totalSales: number;
  taxAmount: number;
  invoiceCount: number;
  distinctProducts: number;
  totalQuantity: number;
  avgInvoiceValue: number;
}

export interface CustomerProductSales {
  itemId: string | null;
  name: string;
  sku: string | null;
  uom: string | null;
  quantity: number;
  revenue: number;
  invoiceCount: number;
  sharePct: number;
}

export interface CustomerTrendPoint {
  period: string;
  revenue: number;
  invoiceCount: number;
}

export interface CustomerAnalytics {
  dateFrom: string;
  dateTo: string;
  groupBy: TrendGroupBy;
  summary: CustomerAnalyticsSummary;
  products: CustomerProductSales[];
  trend: CustomerTrendPoint[];
}

export interface CustomerAnalyticsRange {
  dateFrom: string;
  dateTo: string;
  groupBy: TrendGroupBy;
}

/**
 * Per-customer sales analytics for an explicit date window. One request
 * backs the summary tiles, the product breakdown and the trend chart so
 * they can never disagree about which period they describe.
 */
export function useCustomerAnalytics(customerId: string, range: CustomerAnalyticsRange, enabled = true) {
  const qs = new URLSearchParams({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    groupBy: range.groupBy,
  }).toString();

  return useQuery({
    queryKey: ['customers', 'analytics', customerId, range],
    queryFn: () => api.get<{ data: CustomerAnalytics }>(`/ar/customers/${customerId}/analytics?${qs}`),
    enabled: enabled && !!customerId,
  });
}

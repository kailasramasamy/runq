import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { MfgDashboard, WoSummaryRow, YieldTrendPoint, BomUsageRow, WoPendingCloseRow } from '@runq/types';
import type { ApiSuccess } from '@runq/types';
import type {
  WoSummaryFilter,
  YieldTrendFilter,
  BomUsageFilter,
  WoPendingCloseFilter,
} from '@runq/validators';

// ─── Cache Keys ───────────────────────────────────────────────────────────────

export const MFG_REPORT_KEYS = {
  dashboard: ['mfg', 'dashboard'] as const,
  woSummary: (filter?: WoSummaryFilter) => ['mfg', 'reports', 'wo-summary', filter] as const,
  yieldTrend: (filter?: YieldTrendFilter) => ['mfg', 'reports', 'yield-trend', filter] as const,
  bomUsage: (filter?: BomUsageFilter) => ['mfg', 'reports', 'bom-usage', filter] as const,
  woPendingClose: (filter?: WoPendingCloseFilter) => ['mfg', 'reports', 'wo-pending-close', filter] as const,
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function useMfgDashboard() {
  return useQuery({
    queryKey: MFG_REPORT_KEYS.dashboard,
    queryFn: () => api.get<ApiSuccess<MfgDashboard>>('/manufacturing/dashboard'),
    staleTime: 30_000,
  });
}

// ─── Report hooks ─────────────────────────────────────────────────────────────

function buildQs(obj: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  return params.toString();
}

export function useWoSummary(filter?: WoSummaryFilter) {
  const qs = buildQs({
    bomId: filter?.bomId,
    warehouseId: filter?.warehouseId,
    status: filter?.status,
    from: filter?.from,
    to: filter?.to,
  });
  return useQuery({
    queryKey: MFG_REPORT_KEYS.woSummary(filter),
    queryFn: () =>
      api.get<ApiSuccess<WoSummaryRow[]>>(
        `/manufacturing/reports/wo-summary${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useYieldTrend(filter?: YieldTrendFilter) {
  const qs = buildQs({
    bomId: filter?.bomId,
    bucket: filter?.bucket,
    from: filter?.from,
    to: filter?.to,
  });
  return useQuery({
    queryKey: MFG_REPORT_KEYS.yieldTrend(filter),
    queryFn: () =>
      api.get<ApiSuccess<YieldTrendPoint[]>>(
        `/manufacturing/reports/yield-trend${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useBomUsage(filter?: BomUsageFilter) {
  const qs = buildQs({
    isActive: filter?.isActive,
    search: filter?.search,
    from: filter?.from,
    to: filter?.to,
  });
  return useQuery({
    queryKey: MFG_REPORT_KEYS.bomUsage(filter),
    queryFn: () =>
      api.get<ApiSuccess<BomUsageRow[]>>(
        `/manufacturing/reports/bom-usage${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useWoPendingClose(filter?: WoPendingCloseFilter) {
  const qs = buildQs({ minAgeDays: filter?.minAgeDays });
  return useQuery({
    queryKey: MFG_REPORT_KEYS.woPendingClose(filter),
    queryFn: () =>
      api.get<ApiSuccess<WoPendingCloseRow[]>>(
        `/manufacturing/reports/wo-pending-close${qs ? `?${qs}` : ''}`,
      ),
  });
}

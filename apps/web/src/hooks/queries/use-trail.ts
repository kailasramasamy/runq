import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

interface TrailNode {
  type: string;
  id: string;
  label: string;
  summary: string;
  date: string | null;
  status: string | null;
  url: string;
}

interface DocumentTrail {
  root: TrailNode;
  chain: TrailNode[];
  gaps: string[];
}

export function useDocumentTrail(entityType: string, entityId: string, enabled = true) {
  return useQuery({
    queryKey: ['document-trail', entityType, entityId],
    queryFn: () => api.get<{ data: DocumentTrail }>(`/audit/trail/${entityType}/${entityId}`),
    enabled: enabled && !!entityType && !!entityId,
  });
}

interface GapItem {
  entityType: string;
  entityId: string;
  label: string;
  summary: string;
  date: string | null;
  url: string;
}

interface GapCategorySummary {
  key: string;
  title: string;
  description: string;
  severity: 'error' | 'warning';
  count: number;
}

interface GapScanSummary {
  categories: GapCategorySummary[];
  totalGaps: number;
  daysScanned: number;
  scannedAt: string;
}

interface GapCategoryItems {
  key: string;
  items: GapItem[];
}

export function useGapScan(days = 90) {
  return useQuery({
    queryKey: ['gap-scan', days],
    queryFn: () => api.get<{ data: GapScanSummary }>(`/audit/gap-scan?days=${days}`),
  });
}

export function useGapItems(key: string, days = 90, enabled = false) {
  return useQuery({
    queryKey: ['gap-scan', 'items', key, days],
    queryFn: () => api.get<{ data: GapCategoryItems }>(`/audit/gap-scan/${key}/items?days=${days}`),
    enabled,
  });
}

interface FixStep {
  action: string;
  result: string;
  success: boolean;
}

interface FixResult {
  steps: FixStep[];
  allFixed: boolean;
  manualRequired: string[];
}

export async function fixEntity(entityType: string, entityId: string, mode?: 'unmatch'): Promise<{ data: FixResult }> {
  const qs = mode ? `?mode=${mode}` : '';
  return api.post<{ data: FixResult }>(`/audit/fix/${entityType}/${entityId}${qs}`);
}

export type { TrailNode, DocumentTrail, GapItem, GapCategorySummary, GapScanSummary, GapCategoryItems, FixStep, FixResult };

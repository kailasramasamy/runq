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

interface GapCategory {
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  items: GapItem[];
}

interface GapScanResult {
  categories: GapCategory[];
  totalGaps: number;
  scannedAt: string;
}

export function useGapScan(enabled = true) {
  return useQuery({
    queryKey: ['gap-scan'],
    queryFn: () => api.get<{ data: GapScanResult }>('/audit/gap-scan'),
    enabled,
  });
}

export type { TrailNode, DocumentTrail, GapItem, GapCategory, GapScanResult };

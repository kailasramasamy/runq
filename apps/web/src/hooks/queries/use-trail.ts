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

export type { TrailNode, DocumentTrail };

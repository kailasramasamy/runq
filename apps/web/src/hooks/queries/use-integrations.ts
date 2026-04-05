import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { Integration, IntegrationLog, ApiSuccess } from '@runq/types';

const INT_KEYS = {
  list: ['integrations'] as const,
  logs: (id: string) => ['integrations', 'logs', id] as const,
};

export function useIntegrations() {
  return useQuery({
    queryKey: INT_KEYS.list,
    queryFn: () => api.get<ApiSuccess<Integration[]>>('/integrations'),
  });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { provider: string; config?: Record<string, unknown> }) =>
      api.post<ApiSuccess<Integration>>('/integrations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: INT_KEYS.list }),
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; isActive?: boolean; config?: Record<string, unknown> }) =>
      api.put<ApiSuccess<Integration>>(`/integrations/${data.id}`, {
        isActive: data.isActive,
        config: data.config,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INT_KEYS.list }),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/integrations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: INT_KEYS.list }),
  });
}

export function useTriggerSync() {
  return useMutation({
    mutationFn: (data: { id: string; action: string }) =>
      api.post<ApiSuccess<IntegrationLog>>(`/integrations/${data.id}/sync`, { action: data.action }),
  });
}

export function useIntegrationLogs(integrationId: string) {
  return useQuery({
    queryKey: INT_KEYS.logs(integrationId),
    queryFn: () => api.get<ApiSuccess<IntegrationLog[]>>(`/integrations/${integrationId}/logs`),
    enabled: !!integrationId,
  });
}

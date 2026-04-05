import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  secret?: string;
  failureCount: number;
  lastDeliveredAt: string | null;
  createdAt: string;
}

const KEYS = {
  list: ['webhook-endpoints'] as const,
};

export function useWebhookEndpoints() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: () => api.get<ApiSuccess<WebhookEndpoint[]>>('/webhook-endpoints'),
  });
}

export function useCreateWebhookEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { url: string; description?: string; events: string[] }) =>
      api.post<ApiSuccess<WebhookEndpoint>>('/webhook-endpoints', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useUpdateWebhookEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; url?: string; description?: string; events?: string[]; isActive?: boolean }) =>
      api.put<ApiSuccess<WebhookEndpoint>>(`/webhook-endpoints/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useDeleteWebhookEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/webhook-endpoints/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<{ success: boolean }>>(`/webhook-endpoints/test/${id}`),
  });
}

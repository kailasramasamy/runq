import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { WorkOrderWithDetail, WorkOrderListRow } from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type { CreateWorkOrderInput, UpdateWorkOrderInput, CancelWorkOrderInput } from '@runq/validators';

interface WorkOrderListFilters {
  status?: string;
  bomId?: string;
  warehouseId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const WO_KEYS = {
  all: ['work-orders'] as const,
  list: (filters?: WorkOrderListFilters) => ['work-orders', 'list', filters] as const,
  detail: (id: string) => ['work-orders', 'detail', id] as const,
};

export function useWorkOrders(filters?: WorkOrderListFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bomId) params.set('bomId', filters.bomId);
  if (filters?.warehouseId) params.set('warehouseId', filters.warehouseId);
  if (filters?.scheduledFrom) params.set('scheduledFrom', filters.scheduledFrom);
  if (filters?.scheduledTo) params.set('scheduledTo', filters.scheduledTo);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: WO_KEYS.list(filters),
    queryFn: () =>
      api.get<PaginatedResponse<WorkOrderListRow>>(
        `/manufacturing/wos${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: WO_KEYS.detail(id),
    queryFn: () =>
      api.get<ApiSuccess<WorkOrderWithDetail>>(`/manufacturing/wos/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkOrderInput) =>
      api.post<ApiSuccess<WorkOrderWithDetail>>('/manufacturing/wos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: WO_KEYS.all }),
  });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWorkOrderInput }) =>
      api.put<ApiSuccess<WorkOrderWithDetail>>(`/manufacturing/wos/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: WO_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: WO_KEYS.all });
    },
  });
}

export function useCancelWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CancelWorkOrderInput }) =>
      api.post<ApiSuccess<WorkOrderWithDetail>>(`/manufacturing/wos/${id}/cancel`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: WO_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: WO_KEYS.all });
    },
  });
}

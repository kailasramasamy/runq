import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type {
  WoConsumption,
  WoOutput,
  SuggestedBatch,
  WoCostingPreview,
} from '@runq/types';
import type { PaginatedResponse, ApiSuccess } from '@runq/types';
import type { RecordConsumptionInput, RecordOutputInput, CloseWorkOrderInput } from '@runq/validators';
import { WO_KEYS } from './use-work-orders';

// ─── Query key helpers ────────────────────────────────────────────────────────

export const WO_RUN_KEYS = {
  consumption: (woId: string) => ['wo-run', 'consumption', woId] as const,
  output: (woId: string) => ['wo-run', 'output', woId] as const,
  suggestedBatches: (woId: string, inputItemId: string, warehouseId: string, requiredQty?: number) =>
    ['wo-run', 'suggested-batches', woId, inputItemId, warehouseId, requiredQty] as const,
  costingPreview: (woId: string) => ['wo-run', 'costing-preview', woId] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useWoConsumption(woId: string) {
  return useQuery({
    queryKey: WO_RUN_KEYS.consumption(woId),
    queryFn: () =>
      api.get<PaginatedResponse<WoConsumption>>(`/manufacturing/wos/${woId}/consumption`),
    enabled: !!woId,
  });
}

export function useWoOutput(woId: string) {
  return useQuery({
    queryKey: WO_RUN_KEYS.output(woId),
    queryFn: () =>
      api.get<PaginatedResponse<WoOutput>>(`/manufacturing/wos/${woId}/output`),
    enabled: !!woId,
  });
}

export function useSuggestedBatches({
  woId,
  inputItemId,
  warehouseId,
  requiredQty,
}: {
  woId: string;
  inputItemId: string;
  warehouseId: string;
  requiredQty?: number;
}) {
  const params = new URLSearchParams({ inputItemId, warehouseId });
  if (requiredQty !== undefined) params.set('requiredQty', String(requiredQty));
  return useQuery({
    queryKey: WO_RUN_KEYS.suggestedBatches(woId, inputItemId, warehouseId, requiredQty),
    queryFn: () =>
      api.get<ApiSuccess<SuggestedBatch[]>>(
        `/manufacturing/wos/${woId}/suggested-batches?${params.toString()}`,
      ),
    enabled: !!(woId && inputItemId && warehouseId),
  });
}

export function useWoCostingPreview(woId: string) {
  return useQuery({
    queryKey: WO_RUN_KEYS.costingPreview(woId),
    queryFn: () =>
      api.get<ApiSuccess<WoCostingPreview>>(`/manufacturing/wos/${woId}/preview`),
    enabled: !!woId,
    refetchInterval: false,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function invalidateAll(qc: ReturnType<typeof useQueryClient>, woId: string) {
  qc.invalidateQueries({ queryKey: WO_KEYS.detail(woId) });
  qc.invalidateQueries({ queryKey: WO_KEYS.all });
  qc.invalidateQueries({ queryKey: WO_RUN_KEYS.consumption(woId) });
  qc.invalidateQueries({ queryKey: WO_RUN_KEYS.output(woId) });
  qc.invalidateQueries({ queryKey: WO_RUN_KEYS.costingPreview(woId) });
}

export function useRecordConsumption(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordConsumptionInput) =>
      api.post<ApiSuccess<WoConsumption>>(`/manufacturing/wos/${woId}/consumption`, data),
    onSuccess: () => invalidateAll(qc, woId),
  });
}

export function useReverseConsumption(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (consumptionId: string) =>
      api.delete<ApiSuccess<void>>(`/manufacturing/wos/${woId}/consumption/${consumptionId}`),
    onSuccess: () => invalidateAll(qc, woId),
  });
}

export function useRecordOutput(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordOutputInput) =>
      api.post<ApiSuccess<WoOutput>>(`/manufacturing/wos/${woId}/output`, data),
    onSuccess: () => invalidateAll(qc, woId),
  });
}

export function useReverseOutput(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (outputId: string) =>
      api.delete<ApiSuccess<void>>(`/manufacturing/wos/${woId}/output/${outputId}`),
    onSuccess: () => invalidateAll(qc, woId),
  });
}

export function useStartWo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (woId: string) =>
      api.post<ApiSuccess<void>>(`/manufacturing/wos/${woId}/start`, {}),
    onSuccess: (_, woId) => {
      qc.invalidateQueries({ queryKey: WO_KEYS.detail(woId) });
      qc.invalidateQueries({ queryKey: WO_KEYS.all });
    },
  });
}

export function useCompleteWo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (woId: string) =>
      api.post<ApiSuccess<void>>(`/manufacturing/wos/${woId}/complete`, {}),
    onSuccess: (_, woId) => {
      qc.invalidateQueries({ queryKey: WO_KEYS.detail(woId) });
      qc.invalidateQueries({ queryKey: WO_KEYS.all });
      qc.invalidateQueries({ queryKey: WO_RUN_KEYS.costingPreview(woId) });
    },
  });
}

export function useCloseWo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ woId, data }: { woId: string; data: CloseWorkOrderInput }) =>
      api.post<ApiSuccess<void>>(`/manufacturing/wos/${woId}/close`, data),
    onSuccess: (_, { woId }) => {
      qc.invalidateQueries({ queryKey: WO_KEYS.detail(woId) });
      qc.invalidateQueries({ queryKey: WO_KEYS.all });
      qc.invalidateQueries({ queryKey: WO_RUN_KEYS.costingPreview(woId) });
      qc.invalidateQueries({ queryKey: WO_RUN_KEYS.consumption(woId) });
      qc.invalidateQueries({ queryKey: WO_RUN_KEYS.output(woId) });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { InputPool, ProductionPreview, WorkOrderWithDetail } from '@runq/types';
import type { ApiSuccess } from '@runq/types';
import type { ProductionPreviewInput, RecordProductionInput } from '@runq/validators';
import { WO_KEYS } from './use-work-orders';

/**
 * Unplanned production entry ("Record Production") hooks.
 * Spec: docs/manufacturing-plan.md §5.4.
 */

export interface RecordProductionResult {
  data: WorkOrderWithDetail;
  warnings: string[];
}

const PRODUCTION_KEYS = {
  preview: (body: ProductionPreviewInput) => ['production', 'preview', body] as const,
  pool: (bomId: string, warehouseId: string) =>
    ['production', 'pool', bomId, warehouseId] as const,
};

/**
 * Backflush + FEFO-allocation preview. Callers debounce their own inputs and
 * pass `enabled` once there's enough to preview (BOM/output + qty + warehouse).
 */
export function useProductionPreview(body: ProductionPreviewInput, enabled: boolean) {
  return useQuery({
    queryKey: PRODUCTION_KEYS.preview(body),
    queryFn: () =>
      api.post<ApiSuccess<ProductionPreview>>('/manufacturing/production/preview', body),
    enabled,
  });
}

/**
 * Everything on hand behind a BOM's inputs, in the order a run would draw it.
 * Read-only — nothing is reserved by looking.
 */
export function useInputPool(bomId: string, warehouseId: string) {
  return useQuery({
    queryKey: PRODUCTION_KEYS.pool(bomId, warehouseId),
    queryFn: () =>
      api.get<ApiSuccess<InputPool>>(
        `/manufacturing/production/pool?bomId=${bomId}&warehouseId=${warehouseId}`,
      ),
    enabled: !!bomId && !!warehouseId,
  });
}

export function useRecordProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordProductionInput) =>
      api.post<RecordProductionResult>('/manufacturing/production', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: WO_KEYS.all }),
  });
}

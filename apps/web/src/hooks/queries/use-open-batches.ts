import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

/**
 * PP — Direct Receipt batch picker.
 *
 * Lists currently-open batches (on-hand qty > 0) for a (item, warehouse)
 * pair, plus a server-rendered `suggested` code for the "Start new batch"
 * path (driven by items.batch_code_template).
 */

export interface OpenBatchRow {
  batchNo: string;
  onHandQty: number;
  lastMovementAt: string | null;
  expiryDate: string | null;
}

export interface OpenBatchesResponse {
  open: OpenBatchRow[];
  suggested: string | null;
}

export function useOpenBatches(itemId: string, warehouseId: string) {
  const enabled = !!(itemId && warehouseId);
  return useQuery({
    queryKey: ['open-batches', itemId, warehouseId],
    enabled,
    queryFn: () => {
      const qs = new URLSearchParams({ itemId, warehouseId }).toString();
      return api.get<OpenBatchesResponse>(`/purchase/direct-receipts/open-batches?${qs}`);
    },
  });
}

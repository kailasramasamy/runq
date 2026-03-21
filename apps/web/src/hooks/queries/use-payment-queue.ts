import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type {
  PaymentBatch,
  PaymentBatchWithInstructions,
  PaginatedResponse,
  ApiSuccess,
  ExecuteBatchResult,
} from '@runq/types';
import type {
  CreatePaymentBatchInput,
  ApproveInstructionsInput,
  RejectInstructionsInput,
  PaymentBatchFilter,
} from '@runq/validators';

const QUEUE_KEYS = {
  all: ['payment-queue'] as const,
  list: (filters?: Record<string, unknown>) => ['payment-queue', 'list', filters] as const,
  detail: (id: string) => ['payment-queue', 'detail', id] as const,
};

function buildFilterQs(filters?: PaymentBatchFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function usePaymentBatches(filters?: PaymentBatchFilter) {
  return useQuery({
    queryKey: QUEUE_KEYS.list(filters as Record<string, unknown>),
    queryFn: () =>
      api.get<PaginatedResponse<PaymentBatch>>(`/ap/payment-queue${buildFilterQs(filters)}`),
  });
}

export function usePaymentBatch(id: string) {
  return useQuery({
    queryKey: QUEUE_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<PaymentBatchWithInstructions>>(`/ap/payment-queue/${id}`),
    enabled: !!id,
  });
}

export function useCreatePaymentBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePaymentBatchInput) =>
      api.post<ApiSuccess<PaymentBatchWithInstructions>>('/ap/payment-queue', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUEUE_KEYS.all }),
  });
}

export function useApproveInstructions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, data }: { batchId: string; data: ApproveInstructionsInput }) =>
      api.post<ApiSuccess<PaymentBatchWithInstructions>>(`/ap/payment-queue/${batchId}/approve`, data),
    onSuccess: (_res, { batchId }) => {
      qc.invalidateQueries({ queryKey: QUEUE_KEYS.all });
      qc.invalidateQueries({ queryKey: QUEUE_KEYS.detail(batchId) });
    },
  });
}

export function useRejectInstructions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, data }: { batchId: string; data: RejectInstructionsInput }) =>
      api.post<ApiSuccess<PaymentBatchWithInstructions>>(`/ap/payment-queue/${batchId}/reject`, data),
    onSuccess: (_res, { batchId }) => {
      qc.invalidateQueries({ queryKey: QUEUE_KEYS.all });
      qc.invalidateQueries({ queryKey: QUEUE_KEYS.detail(batchId) });
    },
  });
}

export function useExecuteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, bankAccountId }: { batchId: string; bankAccountId: string }) =>
      api.post<ApiSuccess<ExecuteBatchResult>>(`/ap/payment-queue/${batchId}/execute`, { bankAccountId }),
    onSuccess: (_res, { batchId }) => {
      qc.invalidateQueries({ queryKey: QUEUE_KEYS.all });
      qc.invalidateQueries({ queryKey: QUEUE_KEYS.detail(batchId) });
    },
  });
}

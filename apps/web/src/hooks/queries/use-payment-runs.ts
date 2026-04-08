import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type {
  PaymentRun,
  PaymentRunWithLines,
  PaginatedResponse,
  ApiSuccess,
  ExecuteRunResult,
} from '@runq/types';
import type {
  CreatePaymentRunInput,
  ApproveLinesInput,
  RejectLinesInput,
  PaymentRunFilter,
} from '@runq/validators';

const RUN_KEYS = {
  all: ['payment-runs'] as const,
  list: (filters?: Record<string, unknown>) => ['payment-runs', 'list', filters] as const,
  detail: (id: string) => ['payment-runs', 'detail', id] as const,
};

function buildFilterQs(filters?: PaymentRunFilter): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function usePaymentRuns(filters?: PaymentRunFilter) {
  return useQuery({
    queryKey: RUN_KEYS.list(filters as Record<string, unknown>),
    queryFn: () =>
      api.get<PaginatedResponse<PaymentRun>>(`/ap/payment-runs${buildFilterQs(filters)}`),
  });
}

export function usePaymentRun(id: string) {
  return useQuery({
    queryKey: RUN_KEYS.detail(id),
    queryFn: () => api.get<ApiSuccess<PaymentRunWithLines>>(`/ap/payment-runs/${id}`),
    enabled: !!id,
  });
}

export function useCreatePaymentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePaymentRunInput) =>
      api.post<ApiSuccess<PaymentRunWithLines>>('/ap/payment-runs', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUN_KEYS.all }),
  });
}

export function useApproveLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, data }: { runId: string; data: ApproveLinesInput }) =>
      api.post<ApiSuccess<PaymentRunWithLines>>(`/ap/payment-runs/${runId}/approve`, data),
    onSuccess: (_res, { runId }) => {
      qc.invalidateQueries({ queryKey: RUN_KEYS.all });
      qc.invalidateQueries({ queryKey: RUN_KEYS.detail(runId) });
    },
  });
}

export function useRejectLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, data }: { runId: string; data: RejectLinesInput }) =>
      api.post<ApiSuccess<PaymentRunWithLines>>(`/ap/payment-runs/${runId}/reject`, data),
    onSuccess: (_res, { runId }) => {
      qc.invalidateQueries({ queryKey: RUN_KEYS.all });
      qc.invalidateQueries({ queryKey: RUN_KEYS.detail(runId) });
    },
  });
}

export function useExecuteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, bankAccountId }: { runId: string; bankAccountId: string }) =>
      api.post<ApiSuccess<ExecuteRunResult>>(`/ap/payment-runs/${runId}/execute`, { bankAccountId }),
    onSuccess: (_res, { runId }) => {
      qc.invalidateQueries({ queryKey: RUN_KEYS.all });
      qc.invalidateQueries({ queryKey: RUN_KEYS.detail(runId) });
    },
  });
}

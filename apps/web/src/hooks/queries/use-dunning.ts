import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { DunningRule, DunningLogEntry, PaginatedResponse, ApiSuccess } from '@runq/types';
import type { DunningRuleInput, SendRemindersInput, DunningLogFilter } from '@runq/validators';

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  daysOverdue: number;
}

const DUNNING_KEYS = {
  all: ['dunning'] as const,
  rules: () => ['dunning', 'rules'] as const,
  overdue: () => ['dunning', 'overdue'] as const,
  log: (filters?: Record<string, unknown>) => ['dunning', 'log', filters] as const,
};

export function useDunningRules() {
  return useQuery({
    queryKey: DUNNING_KEYS.rules(),
    queryFn: () => api.get<ApiSuccess<DunningRule[]>>('/ar/dunning/rules'),
  });
}

export function useCreateDunningRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DunningRuleInput) =>
      api.post<ApiSuccess<DunningRule>>('/ar/dunning/rules', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: DUNNING_KEYS.rules() }),
  });
}

export function useUpdateDunningRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DunningRuleInput> }) =>
      api.put<ApiSuccess<DunningRule>>(`/ar/dunning/rules/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: DUNNING_KEYS.rules() }),
  });
}

export function useOverdueInvoices() {
  return useQuery({
    queryKey: DUNNING_KEYS.overdue(),
    queryFn: () => api.get<ApiSuccess<OverdueInvoice[]>>('/ar/dunning/overdue'),
  });
}

export function useSendReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SendRemindersInput) =>
      api.post<ApiSuccess<{ logged: number }>>('/ar/dunning/send-reminders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DUNNING_KEYS.overdue() });
      qc.invalidateQueries({ queryKey: DUNNING_KEYS.log() });
    },
  });
}

export function useDunningLog(filters?: DunningLogFilter) {
  return useQuery({
    queryKey: DUNNING_KEYS.log(filters as Record<string, unknown>),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.invoiceId) params.set('invoiceId', filters.invoiceId);
      if (filters?.customerId) params.set('customerId', filters.customerId);
      if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters?.dateTo) params.set('dateTo', filters.dateTo);
      const qs = params.toString();
      return api.get<PaginatedResponse<DunningLogEntry>>(`/ar/dunning/log${qs ? `?${qs}` : ''}`);
    },
  });
}

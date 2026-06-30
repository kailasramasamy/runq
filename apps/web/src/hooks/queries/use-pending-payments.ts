import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

export type PendingPaymentStatus = 'pending' | 'matched' | 'cancelled';

export interface PendingPayment {
  id: string;
  bankAccountId: string;
  amount: string;
  paymentDate: string;
  glAccountId: string;
  glAccountCode: string | null;
  glAccountName: string | null;
  payeeName: string | null;
  note: string | null;
  upiRef: string | null;
  status: PendingPaymentStatus;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  matchedBankTransactionId: string | null;
  attachmentId: string | null;
  createdAt: string;
}

export interface UpdatePendingPaymentInput {
  bankAccountId?: string;
  amount?: number;
  paymentDate?: string;
  glAccountId?: string;
  payeeName?: string | null;
  note?: string | null;
  upiRef?: string | null;
}

const KEYS = {
  all: ['pending-payments'] as const,
  list: (status: string) => ['pending-payments', 'list', status] as const,
};

export function usePendingPayments(status: 'all' | PendingPaymentStatus = 'all') {
  return useQuery({
    queryKey: KEYS.list(status),
    queryFn: () => api.get<ApiSuccess<PendingPayment[]>>(`/banking/pending-payments?status=${status}`),
  });
}

export function useUpdatePendingPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdatePendingPaymentInput & { id: string }) =>
      api.patch<ApiSuccess<{ success: boolean }>>(`/banking/pending-payments/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useCancelPendingPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<{ success: boolean }>>(`/banking/pending-payments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

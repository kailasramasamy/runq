import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export interface PrioritizedPayment {
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  vendorCategory: string | null;
  balanceDue: string;
  dueDate: string;
  daysOverdue: number;
  daysUntilDue: number;
  urgencyScore: number;
  reason: string;
}

export interface PrioritySummary {
  totalOverdue: string;
  totalDueThisWeek: string;
  totalApproved: string;
}

interface PriorityResponse {
  data: PrioritizedPayment[];
  summary: PrioritySummary;
}

export function usePaymentPriority(limit = 8) {
  return useQuery({
    queryKey: ['payment-priority', limit],
    queryFn: () => api.get<PriorityResponse>(`/ap/payments/prioritize?limit=${limit}`),
    staleTime: 60_000,
  });
}

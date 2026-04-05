import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { VendorContract, VendorRating, PurchaseRequisition, PaymentSchedule, ApiSuccess } from '@runq/types';

const VM_KEYS = {
  contracts: (vendorId?: string) => ['vendor-mgmt', 'contracts', vendorId] as const,
  contract: (id: string) => ['vendor-mgmt', 'contracts', 'detail', id] as const,
  ratings: (vendorId?: string) => ['vendor-mgmt', 'ratings', vendorId] as const,
  scorecard: (vendorId: string) => ['vendor-mgmt', 'scorecard', vendorId] as const,
  requisitions: (status?: string) => ['vendor-mgmt', 'requisitions', status] as const,
  paymentSchedules: (status?: string) => ['vendor-mgmt', 'payment-schedules', status] as const,
  earlyDiscounts: ['vendor-mgmt', 'early-discounts'] as const,
};

// Contracts
export function useVendorContracts(vendorId?: string, status?: string) {
  const params = new URLSearchParams();
  if (vendorId) params.set('vendorId', vendorId);
  if (status) params.set('status', status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: [...VM_KEYS.contracts(vendorId), status] as const,
    queryFn: () => api.get<ApiSuccess<VendorContract[]>>(`/vendor-management/contracts${qs}`),
  });
}

export function useVendorContract(id: string) {
  return useQuery({
    queryKey: VM_KEYS.contract(id),
    queryFn: () => api.get<ApiSuccess<VendorContract>>(`/vendor-management/contracts/${id}`),
    enabled: !!id,
  });
}

export function useUpdateVendorContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        title: string;
        startDate: string;
        endDate: string;
        value: number | null;
        terms: string | null;
        renewalDate: string | null;
        status: 'draft' | 'active' | 'expired' | 'cancelled';
      }>;
    }) => api.put<ApiSuccess<VendorContract>>(`/vendor-management/contracts/${id}`, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'contracts'] });
      qc.invalidateQueries({ queryKey: VM_KEYS.contract(id) });
    },
  });
}

export function useCreateVendorContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      vendorId: string;
      contractNumber: string;
      title: string;
      startDate: string;
      endDate: string;
      value?: number | null;
      terms?: string;
      renewalDate?: string;
    }) => api.post<ApiSuccess<VendorContract>>('/vendor-management/contracts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'contracts'] }),
  });
}

// Ratings
export function useVendorRatings(vendorId?: string) {
  const qs = vendorId ? `?vendorId=${vendorId}` : '';
  return useQuery({
    queryKey: VM_KEYS.ratings(vendorId),
    queryFn: () => api.get<ApiSuccess<VendorRating[]>>(`/vendor-management/ratings${qs}`),
  });
}

export function useVendorScorecard(vendorId: string) {
  return useQuery({
    queryKey: VM_KEYS.scorecard(vendorId),
    queryFn: () => api.get<ApiSuccess<Record<string, unknown>>>(`/vendor-management/ratings/scorecard/${vendorId}`),
    enabled: !!vendorId,
  });
}

export function useCreateVendorRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      vendorId: string;
      period: string;
      deliveryScore: number;
      qualityScore: number;
      pricingScore: number;
      notes?: string;
    }) => api.post<ApiSuccess<VendorRating>>('/vendor-management/ratings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'ratings'] }),
  });
}

// Requisitions
export function usePurchaseRequisitions(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: VM_KEYS.requisitions(status),
    queryFn: () => api.get<ApiSuccess<PurchaseRequisition[]>>(`/vendor-management/requisitions${qs}`),
  });
}

export function useCreateRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      vendorId?: string;
      description: string;
      items: { itemName: string; quantity: number; estimatedUnitPrice?: number }[];
    }) => api.post<ApiSuccess<PurchaseRequisition>>('/vendor-management/requisitions', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'requisitions'] }),
  });
}

export function useUpdateRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: { vendorId?: string | null; description?: string; items?: { itemName: string; quantity: number; estimatedUnitPrice: number }[] };
    }) => api.put<ApiSuccess<PurchaseRequisition>>(`/vendor-management/requisitions/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'requisitions'] }),
  });
}

export function useApproveRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<PurchaseRequisition>>(`/vendor-management/requisitions/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'requisitions'] }),
  });
}

// Payment Schedules
export function usePaymentSchedules(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: VM_KEYS.paymentSchedules(status),
    queryFn: () => api.get<ApiSuccess<PaymentSchedule[]>>(`/vendor-management/payment-schedules${qs}`),
  });
}

export function usePaymentSchedule(id: string) {
  return useQuery({
    queryKey: ['vendor-mgmt', 'payment-schedules', 'detail', id],
    queryFn: () => api.get<ApiSuccess<PaymentSchedule>>(`/vendor-management/payment-schedules/${id}`),
    enabled: !!id,
  });
}

export function useCreatePaymentSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      scheduledDate: string;
      items: { invoiceId: string; vendorId: string; amount: number }[];
    }) => api.post<ApiSuccess<PaymentSchedule>>('/vendor-management/payment-schedules', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'payment-schedules'] }),
  });
}

export function useApprovePaymentSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<PaymentSchedule>>(`/vendor-management/payment-schedules/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-mgmt', 'payment-schedules'] }),
  });
}

// Early Payment Discounts
export interface EarlyPaymentOpportunity {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
  daysRemaining: number;
  discountPercent: number | null;
  discountDays: number | null;
  discountDaysRemaining: number | null;
  discountAvailable: boolean;
  savingsAmount: number | null;
}

export function useEarlyPaymentDiscounts() {
  return useQuery({
    queryKey: VM_KEYS.earlyDiscounts,
    queryFn: () => api.get<ApiSuccess<EarlyPaymentOpportunity[]>>('/vendor-management/early-payment-discounts'),
  });
}

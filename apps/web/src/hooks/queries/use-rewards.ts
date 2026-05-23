import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

// ─── Keys ────────────────────────────────────────────────────────────────────

const RT_KEYS = {
  all: ['reward-types'] as const,
  list: (activeOnly?: boolean) => ['reward-types', 'list', activeOnly] as const,
};

const RW_KEYS = {
  all: ['rewards'] as const,
  list: (filters?: RewardFilters) => ['rewards', 'list', filters] as const,
  detail: (id: string) => ['rewards', 'detail', id] as const,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type RewardKind = 'monetary' | 'recognition' | 'points';
export type RewardStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted' | 'paid';

export interface RewardType {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  kind: RewardKind;
  glAccountCode: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Reward {
  id: string;
  tenantId: string;
  rewardNumber: string;
  employeeId: string;
  rewardTypeId: string;
  kind: RewardKind;
  amount: string;
  pointsUsed: number | null;
  title: string;
  citation: string | null;
  awardDate: string;
  status: RewardStatus;
  initiatedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  glAccountCode: string | null;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  employeeName: string;
  typeName: string;
  initiatorName: string;
}

interface RewardFilters {
  status?: RewardStatus;
  employeeId?: string;
  [key: string]: unknown;
}

// ─── Reward Types ────────────────────────────────────────────────────────────

export function useRewardTypes(activeOnly = false) {
  const qs = activeOnly ? '?activeOnly=true' : '';
  return useQuery({
    queryKey: RT_KEYS.list(activeOnly),
    queryFn: () => api.get<ApiSuccess<RewardType[]>>(`/hr/reward-types${qs}`),
  });
}

export interface CreateRewardTypeInput {
  name: string;
  code: string;
  kind: RewardKind;
  glAccountCode?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export function useCreateRewardType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRewardTypeInput) =>
      api.post<ApiSuccess<RewardType>>('/hr/reward-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RT_KEYS.all }),
  });
}

export function useUpdateRewardType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateRewardTypeInput> }) =>
      api.put<ApiSuccess<RewardType>>(`/hr/reward-types/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RT_KEYS.all }),
  });
}

export function useDeleteRewardType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<null>>(`/hr/reward-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: RT_KEYS.all }),
  });
}

export function useSeedDefaultRewardTypes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ApiSuccess<{ skipped: boolean; count: number }>>('/hr/reward-types/seed-defaults', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: RT_KEYS.all }),
  });
}

// ─── Rewards ─────────────────────────────────────────────────────────────────

export function useRewards(filters?: RewardFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.employeeId) params.set('employeeId', filters.employeeId);
  const qs = params.toString();
  return useQuery({
    queryKey: RW_KEYS.list(filters),
    queryFn: () => api.get<ApiSuccess<Reward[]>>(`/hr/rewards${qs ? `?${qs}` : ''}`),
  });
}

export function useReward(id: string | null) {
  return useQuery({
    queryKey: RW_KEYS.detail(id!),
    queryFn: () => api.get<ApiSuccess<Reward>>(`/hr/rewards/${id}`),
    enabled: !!id,
  });
}

export interface CreateRewardInput {
  employeeId: string;
  rewardTypeId: string;
  amount: number;
  title: string;
  citation?: string;
  awardDate: string;
}

export function useCreateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRewardInput) =>
      api.post<ApiSuccess<Reward>>('/hr/rewards', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RW_KEYS.all }),
  });
}

export function useUpdateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateRewardInput }) =>
      api.put<ApiSuccess<Reward>>(`/hr/rewards/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RW_KEYS.all }),
  });
}

export function useSubmitReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<Reward>>(`/hr/rewards/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: RW_KEYS.all }),
  });
}

export function useApproveReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved, rejectionReason }: { id: string; approved: boolean; rejectionReason?: string }) =>
      api.put<ApiSuccess<Reward>>(`/hr/rewards/${id}/approve`, { approved, rejectionReason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RW_KEYS.all }),
  });
}

export function usePostReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiSuccess<Reward>>(`/hr/rewards/${id}/post`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: RW_KEYS.all }),
  });
}

export interface PayRewardInput {
  bankAccountId: string;
  paymentDate: string;
  paymentMethod?: 'bank_transfer' | 'cash' | 'cheque';
  reference?: string;
  notes?: string;
}

export function usePayReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: PayRewardInput & { id: string }) =>
      api.post<ApiSuccess<Reward>>(`/hr/rewards/${id}/pay`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RW_KEYS.all }),
  });
}

export function useDeleteReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<null>>(`/hr/rewards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: RW_KEYS.all }),
  });
}

export interface SuggestCitationInput {
  title: string;
  employeeName?: string;
  typeName?: string;
}

/** AI-draft a citation from the reward title. */
export function useSuggestRewardCitation() {
  return useMutation({
    mutationFn: (body: SuggestCitationInput) =>
      api.post<ApiSuccess<{ citation: string }>>('/hr/rewards/suggest-citation', body),
  });
}

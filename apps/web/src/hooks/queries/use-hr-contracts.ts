import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ApiSuccess } from '@runq/types';

// Labour contracts — three shapes, none of which needs an employee record.
// See apps/api/src/modules/hr/contracts.

export type ContractType = 'solo_daily' | 'task_lumpsum' | 'crew_daily';

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  solo_daily: 'Daily wage',
  task_lumpsum: 'Task — fixed',
  crew_daily: 'Crew — daily rates',
};

export interface LabourContract {
  id: string;
  contractNumber: string;
  name: string;
  leadPersonName: string;
  leadPersonPhone: string | null;
  contractType: ContractType;
  fixedAmount: string | null;
  startDate: string;
  /** Null on open-ended work. */
  endDate: string | null;
  status: 'active' | 'completed' | 'cancelled';
  notes: string | null;
  /** Derived from the pause windows, never stored. */
  pauseState: PauseState;
  /** List rows only. */
  memberCount: number;
  earnedToDate: number;
  advancesPaid: number;
  outstanding: number;
  throughDate: string;
}

/**
 * Where the work stands today. `pause_scheduled` is a pause booked for a
 * future date — the contract is still running until then.
 */
export type PauseState =
  | { state: 'running' }
  | { state: 'paused'; since: string; until: string | null; reason: string | null }
  | { state: 'pause_scheduled'; from: string; until: string | null; reason: string | null };

export interface ContractPause {
  id: string;
  fromDate: string;
  /** Null while the work is paused with no date to resume. */
  toDate: string | null;
  reason: string | null;
  /** Resume responses only: the pause covered no days and was deleted. */
  removed?: boolean;
}

export interface ContractMember {
  id: string;
  name: string;
  role: string | null;
  dailyRate: string;
  joinedOn: string | null;
  leftOn: string | null;
}

export interface ContractDay {
  id: string;
  memberId: string;
  logDate: string;
  status: 'leave' | 'half_day';
  note: string | null;
}

export interface ContractAdvance {
  id: string;
  memberId: string | null;
  amount: string;
  paidOn: string;
  paymentMethod: string;
  reference: string | null;
  status: 'paid' | 'recovered' | 'cancelled';
}

export interface SettlementLine {
  memberId: string | null;
  memberName: string;
  memberRole: string | null;
  dailyRate: number | null;
  daysWorked: number;
  earned: number;
  advancesRecovered: number;
  netPayable: number;
}

export interface ContractBalance {
  throughDate: string;
  earned: number;
  advancesPaid: number;
  netPayable: number;
  isOpenEnded: boolean;
  /** Days in the priced window the job was stopped. */
  pausedDays: number;
  /**
   * Days actually worked so far, net of leave, half days and pauses. On a
   * crew this is the sum across everyone — man-days, not calendar days.
   */
  daysWorked: number;
  /** What was taken out to get there. */
  leaveDays: number;
  halfDays: number;
  lines: SettlementLine[];
}

export interface ContractSettlement {
  id: string;
  settlementNumber: string;
  fromDate: string;
  toDate: string;
  earned: string;
  advancesRecovered: string;
  otherDeductions: string;
  netPayable: string;
  /** Disbursed so far; the difference from netPayable is what is still due. */
  amountPaid: string;
  status: 'draft' | 'approved' | 'paid' | 'cancelled';
}

export interface SettlementPayment {
  id: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  bankAccountId: string | null;
  reference: string | null;
  notes: string | null;
  voidedAt: string | null;
}

export interface ContractDetail extends LabourContract {
  members: ContractMember[];
  advances: ContractAdvance[];
  settlements: ContractSettlement[];
  dayLog: ContractDay[];
  pauses: ContractPause[];
  balance: ContractBalance;
}

/** What is still to be handed over on a settlement. Never negative. */
export function settlementDue(s: ContractSettlement): number {
  return Math.max(0, Number(s.netPayable) - Number(s.amountPaid));
}

export interface SettlementPreview {
  contractNumber: string;
  name: string;
  leadPersonName: string;
  contractType: ContractType;
  fromDate: string;
  throughDate: string;
  isOpenEnded: boolean;
  earned: number;
  advancesRecovered: number;
  otherDeductions: number;
  netPayable: number;
  pausedDays: number;
  lines: SettlementLine[];
  warnings: string[];
}

export const CONTRACT_KEYS = {
  all: ['hr', 'contracts'] as const,
  list: (status?: string) => ['hr', 'contracts', 'list', status ?? 'all'] as const,
  detail: (id: string) => ['hr', 'contracts', id] as const,
  preview: (id: string, through?: string) =>
    ['hr', 'contracts', id, 'settlement-preview', through ?? 'today'] as const,
  payments: (settlementId: string) =>
    ['hr', 'contracts', 'settlements', settlementId, 'payments'] as const,
};

export function useContracts(status?: string) {
  return useQuery({
    queryKey: CONTRACT_KEYS.list(status),
    queryFn: () =>
      api.get<ApiSuccess<LabourContract[]>>(
        `/hr/contracts${status ? `?status=${status}` : ''}`,
      ),
  });
}

export function useContract(id: string | null) {
  return useQuery({
    queryKey: CONTRACT_KEYS.detail(id ?? ''),
    queryFn: () => api.get<ApiSuccess<ContractDetail>>(`/hr/contracts/${id}`),
    enabled: !!id,
  });
}

/**
 * Never cached: recomputed server-side from the day log, and settling a
 * stale figure underpays the crew.
 */
export function useSettlementPreview(id: string | null, throughDate?: string) {
  return useQuery({
    queryKey: CONTRACT_KEYS.preview(id ?? '', throughDate),
    queryFn: () =>
      api.get<ApiSuccess<SettlementPreview>>(
        `/hr/contracts/${id}/settlement-preview${throughDate ? `?throughDate=${throughDate}` : ''}`,
      ),
    enabled: !!id,
    staleTime: 0,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: CONTRACT_KEYS.all });
}

interface CreatePayload {
  name: string;
  leadPersonName: string;
  leadPersonPhone?: string | null;
  contractType: ContractType;
  startDate: string;
  endDate?: string | null;
  fixedAmount?: number | null;
  dailyRate?: number | null;
  members?: { name: string; role?: string | null; dailyRate: number }[] | null;
  notes?: string | null;
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: CreatePayload) =>
      api.post<ApiSuccess<LabourContract>>(`/hr/contracts`, d),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: Omit<CreatePayload, 'contractType' | 'dailyRate' | 'members'> & { id: string }) =>
      api.put<ApiSuccess<LabourContract>>(`/hr/contracts/${id}`, d),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCancelContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<LabourContract>>(`/hr/contracts/${id}/cancel`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Pause / resume ────────────────────────────────────────────────────────

/** Omit `toDate` for a pause with no date to resume yet. */
export function usePauseContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contractId, ...d }: {
      contractId: string; fromDate: string;
      toDate?: string | null; reason?: string | null;
    }) => api.post<ApiSuccess<ContractPause>>(`/hr/contracts/${contractId}/pause`, d),
    onSuccess: () => invalidateAll(qc),
  });
}

/** `resumeDate` is the first day back; the pause ends the day before it. */
export function useResumeContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contractId, resumeDate }: { contractId: string; resumeDate: string }) =>
      api.put<ApiSuccess<ContractPause>>(`/hr/contracts/${contractId}/resume`, { resumeDate }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeletePause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<{ id: string }>>(`/hr/contract-pauses/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Crew ──────────────────────────────────────────────────────────────────

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contractId, ...d }: {
      contractId: string; name: string; role?: string | null;
      dailyRate: number; joinedOn?: string | null;
    }) => api.post<ApiSuccess<ContractMember>>(`/hr/contracts/${contractId}/members`, d),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: {
      id: string; name: string; role?: string | null; dailyRate: number;
      joinedOn?: string | null; leftOn?: string | null;
    }) => api.put<ApiSuccess<ContractMember>>(`/hr/members/${id}`, d),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<{ id: string }>>(`/hr/members/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────

/**
 * Mark a span of days. Sending `worked` clears the exception — an unmarked
 * day already means worked.
 */
export function useMarkDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contractId, ...d }: {
      contractId: string; fromDate: string; toDate: string;
      status: 'worked' | 'leave' | 'half_day';
      memberIds?: string[] | null; note?: string | null;
    }) => api.post<ApiSuccess<{ days: number; members: number }>>(
      `/hr/contracts/${contractId}/days`, d,
    ),
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Advances ──────────────────────────────────────────────────────────────

export function usePayAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contractId, ...d }: {
      contractId: string; amount: number; paidOn: string;
      memberId?: string | null; paymentMethod: string;
      bankAccountId?: string | null; reference?: string | null;
    }) => api.post<ApiSuccess<ContractAdvance>>(`/hr/contracts/${contractId}/advances`, d),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCancelAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<ContractAdvance>>(`/hr/advances/${id}/cancel`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Settlement ────────────────────────────────────────────────────────────

/**
 * Draft then approve in one call — pressing "Settle" means the posted
 * entry, not a draft somebody has to come back to.
 */
export function useSettleContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      contractId: string; throughDate?: string | null;
      otherDeductions: number; notes?: string | null;
    }) => {
      const draft = await api.post<ApiSuccess<ContractSettlement>>(
        `/hr/contracts/${v.contractId}/settlement`,
        {
          throughDate: v.throughDate ?? null,
          otherDeductions: v.otherDeductions,
          notes: v.notes ?? null,
        },
      );
      return api.put<ApiSuccess<ContractSettlement>>(
        `/hr/settlements/${draft.data.id}/approve`, {},
      );
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSettlementPayments(settlementId: string | null) {
  return useQuery({
    queryKey: CONTRACT_KEYS.payments(settlementId ?? ''),
    queryFn: () =>
      api.get<ApiSuccess<SettlementPayment[]>>(`/hr/settlements/${settlementId}/payments`),
    enabled: !!settlementId,
  });
}

/**
 * Money handed over against a settled contract. Omit `amount` to clear the
 * whole due; pass one to record an instalment.
 */
export function useRecordSettlementPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ settlementId, ...d }: {
      settlementId: string; paymentDate: string; amount?: number | null;
      bankAccountId?: string | null; paymentMethod: string;
      reference?: string | null; notes?: string | null;
    }) => api.post<ApiSuccess<ContractSettlement>>(
      `/hr/settlements/${settlementId}/payments`, d,
    ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useVoidSettlementPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<SettlementPayment>>(`/hr/settlement-payments/${id}/void`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApiSuccess } from '@runq/types';

// Auth-gated <img src> — fetch the binary as blob, hand back an object URL
// the <img> can render. Same pattern as employee photos.
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('runq-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function usePunchSelfieSrc(punchId: string | null, hasSelfie: boolean) {
  return useQuery({
    queryKey: ['punch-selfie', punchId],
    enabled: !!punchId && hasSelfie,
    queryFn: async () => {
      const res = await fetch(`/api/v1/hr/punches/${punchId}/selfie`, {
        headers: authHeaders(),
        cache: 'no-cache',
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    staleTime: Infinity,
  });
}

// ===== TYPES =====
export interface GeoFence {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: number;
  isActive: boolean;
}

export interface AttendancePunch {
  id: string;
  employeeId: string;
  punchAt: string;
  kind: 'in' | 'out';
  latitude: string | null;
  longitude: string | null;
  accuracyMeters: string | null;
  insideFence: boolean;
  geoFenceId: string | null;
  selfieUrl: string | null;
  notes: string | null;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
}

export type RegStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface AttendanceRegularization {
  id: string;
  employeeId: string;
  date: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  requestedStatus: string | null;
  reason: string;
  status: RegStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
}

export type DeclStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export interface TaxDeclaration {
  id: string;
  employeeId: string;
  financialYear: string;
  regime: 'old' | 'new';
  status: DeclStatus;
  hraTotal: string;
  ltaTotal: string;
  homeLoanInterest: string;
  section80c: string;
  section80d: string;
  section80g: string;
  section80ccd1b: string;
  otherDeductions: string;
  notes: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
}

export type LoanStatus = 'draft' | 'requested' | 'manager_approved' | 'active' | 'rejected' | 'closed' | 'written_off';
export interface EmployeeLoan {
  id: string;
  employeeId: string;
  kind: string;
  principal: string;
  emiAmount: string;
  totalInstalments: number;
  outstanding: string;
  status: LoanStatus;
  disbursedOn: string;
  firstEmiMonth: number;
  firstEmiYear: number;
  reason: string | null;
  rejectionReason?: string | null;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
}

export type FnfStatus = 'draft' | 'approved' | 'paid' | 'cancelled';
export interface FnfSettlement {
  id: string;
  employeeId: string;
  resignationDate: string | null;
  lastWorkingDate: string;
  status: FnfStatus;
  grossEarnings: string;
  totalDeductions: string;
  netPayable: string;
  lastMonthSalary: string;
  leaveEncashment: string;
  gratuity: string;
  bonusPayable: string;
  otherEarnings: string;
  noticeRecovery: string;
  loanRecovery: string;
  tds: string;
  pfDeduction: string;
  otherDeductions: string;
  notes: string | null;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}
export interface OnboardingTemplateItem {
  id: string;
  templateId: string;
  sequence: number;
  title: string;
  kind: string;
  assignedRole: string;
  dueDays: number | null;
  instructions: string | null;
}
export interface OnboardingWorkflow {
  id: string;
  employeeId: string;
  templateId: string | null;
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
  totalCount?: number;
  completedCount?: number;
}
export interface OnboardingItem {
  id: string;
  workflowId: string;
  sequence: number;
  title: string;
  kind: string;
  assignedRole: string;
  documentKind: string | null;
  attachmentId: string | null;
  attachmentFileName: string | null;
  attachmentMime: string | null;
  instructions: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  notes: string | null;
}

export interface LetterTemplate {
  id: string;
  name: string;
  kind: string;
  subject: string | null;
  body: string;
}
export interface EmployeeLetter {
  id: string;
  employeeId: string;
  templateId: string | null;
  kind: string;
  subject: string | null;
  renderedBody: string;
  status: 'requested' | 'draft' | 'issued' | 'revoked';
  requestedReason: string | null;
  issuedAt: string | null;
  createdAt: string;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
}

export type TicketStatus = 'open' | 'in_progress' | 'waiting_human' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory =
  | 'payroll' | 'leave' | 'attendance' | 'reimbursement'
  | 'asset' | 'it' | 'document' | 'general';
export interface HrTicket {
  id: string;
  ticketNumber: string;
  employeeId: string;
  subject: string;
  description: string | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo: string | null;
  slaHours: number;
  agentEscalatedAt?: string | null;
  createdAt: string;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
}
export interface HrTicketComment {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorEmail?: string;
  authorName?: string | null;
  authorRole?: string | null;
  body: string;
  isAgentDraft?: boolean;
  agentConfidence?: 'low' | 'medium' | 'high' | null;
  agentCitations?: Array<{ tool: string; label: string }> | null;
  createdAt: string;
}

export interface HelpdeskAgentSettings {
  enabled: boolean;
  faqs: string;
  operatorUserId: string | null;
  perCategory: Record<TicketCategory, { tier: 0 | 1 | 2 | 3; autoResolve: boolean }>;
}

export interface PerformanceCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  reviewStartDate: string | null;
  reviewEndDate: string | null;
  status: 'planned' | 'active' | 'review' | 'closed';
}
export interface PerformanceGoal {
  id: string;
  cycleId: string;
  employeeId: string;
  title: string;
  description: string | null;
  weight: string;
  targetMetric: string | null;
  status: string;
  selfRating: string | null;
  managerRating: string | null;
  finalRating: string | null;
  progressPct?: number | null;
  comments: string | null;
  firstName?: string;
  lastName?: string | null;
  employeeCode?: string;
  departmentName?: string | null;
  designationName?: string | null;
}
export interface PerformanceReview {
  id: string;
  cycleId: string;
  employeeId: string;
  status: 'pending' | 'self_submitted' | 'manager_submitted' | 'finalised' | 'acknowledged';
  selfComments: string | null;
  managerComments: string | null;
  selfOverallRating: string | null;
  managerOverallRating: string | null;
  finalOverallRating: string | null;
  computedSelfScore?: number | null;
  computedManagerScore?: number | null;
  acknowledgedAt?: string | null;
  employeeAckComment?: string | null;
  firstName?: string;
  lastName?: string | null;
}

// ===== HOOKS =====
function invalidate(qc: ReturnType<typeof useQueryClient>, key: string) {
  qc.invalidateQueries({ queryKey: [key] });
}

// -- Geo fences --
export const useGeoFences = () => useQuery({
  queryKey: ['geo-fences'],
  queryFn: () => api.get<ApiSuccess<GeoFence[]>>('/hr/geo-fences'),
});
export const useCreateGeoFence = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { name: string; latitude: number; longitude: number; radiusMeters: number; isActive: boolean }) =>
      api.post<ApiSuccess<GeoFence>>('/hr/geo-fences', d),
    onSuccess: () => invalidate(qc, 'geo-fences'),
  });
};
export const useUpdateGeoFence = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; name?: string; latitude?: number; longitude?: number; radiusMeters?: number; isActive?: boolean }) =>
      api.put<ApiSuccess<GeoFence>>(`/hr/geo-fences/${id}`, d),
    onSuccess: () => invalidate(qc, 'geo-fences'),
  });
};
export const useDeleteGeoFence = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<GeoFence>>(`/hr/geo-fences/${id}`),
    onSuccess: () => invalidate(qc, 'geo-fences'),
  });
};

// -- Punches --
export const useAttendancePunches = (q: { from?: string; to?: string; employeeId?: string } = {}) => {
  const params = new URLSearchParams();
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.employeeId) params.set('employeeId', q.employeeId);
  const qs = params.toString();
  return useQuery({
    queryKey: ['attendance-punches', q],
    queryFn: () => api.get<ApiSuccess<AttendancePunch[]>>(`/hr/attendance-punches${qs ? `?${qs}` : ''}`),
  });
};

// -- Regularizations --
export const useRegularizations = (q: { status?: string; employeeId?: string } = {}) => {
  const params = new URLSearchParams();
  if (q.status) params.set('status', q.status);
  if (q.employeeId) params.set('employeeId', q.employeeId);
  const qs = params.toString();
  return useQuery({
    queryKey: ['regularizations', q],
    queryFn: () => api.get<ApiSuccess<AttendanceRegularization[]>>(`/hr/regularizations${qs ? `?${qs}` : ''}`),
  });
};
export const useReviewRegularization = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved, rejectionReason }: { id: string; approved: boolean; rejectionReason?: string }) =>
      api.put<ApiSuccess<AttendanceRegularization>>(`/hr/regularizations/${id}/review`, { approved, rejectionReason }),
    onSuccess: () => invalidate(qc, 'regularizations'),
  });
};

// -- Tax Declarations --
export const useTaxDeclarations = (q: { status?: string; financialYear?: string; employeeId?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
  const qs = params.toString();
  return useQuery({
    queryKey: ['tax-declarations', q],
    queryFn: () => api.get<ApiSuccess<TaxDeclaration[]>>(`/hr/tax-declarations${qs ? `?${qs}` : ''}`),
  });
};
export const useTaxDeclaration = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['tax-declaration', id],
  queryFn: () => api.get<ApiSuccess<TaxDeclaration & { items: any[] }>>(`/hr/tax-declarations/${id}`),
});
export const useReviewTaxDeclaration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved, rejectionReason }: { id: string; approved: boolean; rejectionReason?: string }) =>
      api.put<ApiSuccess<TaxDeclaration>>(`/hr/tax-declarations/${id}/review`, { approved, rejectionReason }),
    onSuccess: () => { invalidate(qc, 'tax-declarations'); invalidate(qc, 'tax-declaration'); },
  });
};

// -- Loans --
export const useLoans = (q: { status?: string; employeeId?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
  const qs = params.toString();
  return useQuery({
    queryKey: ['loans', q],
    queryFn: () => api.get<ApiSuccess<EmployeeLoan[]>>(`/hr/loans${qs ? `?${qs}` : ''}`),
  });
};
export const useLoan = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['loan', id],
  queryFn: () => api.get<ApiSuccess<EmployeeLoan & { instalments: any[] }>>(`/hr/loans/${id}`),
});
export const useCreateLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<EmployeeLoan>>('/hr/loans', d),
    onSuccess: () => invalidate(qc, 'loans'),
  });
};
export const useApproveLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved, disbursedOn, firstEmiMonth, firstEmiYear }: {
      id: string;
      approved: boolean;
      disbursedOn?: string;
      firstEmiMonth?: number;
      firstEmiYear?: number;
    }) =>
      api.put<ApiSuccess<EmployeeLoan>>(`/hr/loans/${id}/approve`, {
        approved,
        ...(disbursedOn ? { disbursedOn } : {}),
        ...(firstEmiMonth ? { firstEmiMonth } : {}),
        ...(firstEmiYear ? { firstEmiYear } : {}),
      }),
    onSuccess: () => { invalidate(qc, 'loans'); invalidate(qc, 'loan'); },
  });
};
export const useRejectLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejectionReason }: { id: string; rejectionReason: string }) =>
      api.put<ApiSuccess<EmployeeLoan>>(`/hr/loans/${id}/reject`, { rejectionReason }),
    onSuccess: () => { invalidate(qc, 'loans'); invalidate(qc, 'loan'); },
  });
};
export const useDeleteLoan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<EmployeeLoan>>(`/hr/loans/${id}`),
    onSuccess: () => invalidate(qc, 'loans'),
  });
};

export interface LoanPolicy {
  employeeRequestsEnabled: boolean;
  minTenureDays: number;
  maxPctOfMonthlyCtc: number;
  maxActiveLoans: number;
  managerApprovalRequired: boolean;
  allowedKinds: string[] | null;
}

export const useLoanPolicy = () => useQuery({
  queryKey: ['loan-policy'],
  queryFn: () => api.get<ApiSuccess<LoanPolicy>>('/hr/loan-policy'),
});

export const useUpdateLoanPolicy = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoanPolicy) => api.put<ApiSuccess<LoanPolicy>>('/hr/loan-policy', input),
    onSuccess: () => invalidate(qc, 'loan-policy'),
  });
};

// -- FNF --
export const useFnfList = (q: { status?: string } = {}) => {
  const params = new URLSearchParams();
  if (q.status) params.set('status', q.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['fnf', q],
    queryFn: () => api.get<ApiSuccess<FnfSettlement[]>>(`/hr/fnf${qs ? `?${qs}` : ''}`),
  });
};
export const useFnf = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['fnf-detail', id],
  queryFn: () => api.get<ApiSuccess<FnfSettlement>>(`/hr/fnf/${id}`),
});
export const useCreateFnf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<FnfSettlement>>('/hr/fnf', d),
    onSuccess: () => invalidate(qc, 'fnf'),
  });
};
export const useUpdateFnf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<FnfSettlement>>(`/hr/fnf/${id}`, d),
    onSuccess: () => { invalidate(qc, 'fnf'); invalidate(qc, 'fnf-detail'); },
  });
};
export const useApproveFnf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put<ApiSuccess<FnfSettlement>>(`/hr/fnf/${id}/approve`, {}),
    onSuccess: () => { invalidate(qc, 'fnf'); invalidate(qc, 'fnf-detail'); },
  });
};
export const usePayFnf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put<ApiSuccess<FnfSettlement>>(`/hr/fnf/${id}/pay`, {}),
    onSuccess: () => { invalidate(qc, 'fnf'); invalidate(qc, 'fnf-detail'); },
  });
};

// -- Onboarding --
export const useOnboardingTemplates = () => useQuery({
  queryKey: ['onboarding-templates'],
  queryFn: () => api.get<ApiSuccess<OnboardingTemplate[]>>('/hr/onboarding/templates'),
});
export const useOnboardingTemplate = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['onboarding-template', id],
  queryFn: () => api.get<ApiSuccess<OnboardingTemplate & { items: OnboardingTemplateItem[] }>>(`/hr/onboarding/templates/${id}`),
});
export const useCreateOnboardingTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<OnboardingTemplate>>('/hr/onboarding/templates', d),
    onSuccess: () => invalidate(qc, 'onboarding-templates'),
  });
};
export const useUpdateOnboardingTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<OnboardingTemplate>>(`/hr/onboarding/templates/${id}`, d),
    onSuccess: () => { invalidate(qc, 'onboarding-templates'); invalidate(qc, 'onboarding-template'); },
  });
};
export const useDeleteOnboardingTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<OnboardingTemplate>>(`/hr/onboarding/templates/${id}`),
    onSuccess: () => invalidate(qc, 'onboarding-templates'),
  });
};
export const useOnboardingWorkflows = () => useQuery({
  queryKey: ['onboarding-workflows'],
  queryFn: () => api.get<ApiSuccess<OnboardingWorkflow[]>>('/hr/onboarding/workflows'),
});
export const useOnboardingWorkflow = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['onboarding-workflow', id],
  queryFn: () => api.get<ApiSuccess<OnboardingWorkflow & { items: OnboardingItem[] }>>(`/hr/onboarding/workflows/${id}`),
});
export const useStartOnboarding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { employeeId: string; templateId?: string }) =>
      api.post<ApiSuccess<OnboardingWorkflow>>('/hr/onboarding/start', d),
    onSuccess: () => invalidate(qc, 'onboarding-workflows'),
  });
};
export const useDeleteOnboardingWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ApiSuccess<OnboardingWorkflow>>(`/hr/onboarding/workflows/${id}`),
    onSuccess: () => { invalidate(qc, 'onboarding-workflows'); invalidate(qc, 'onboarding-workflow'); },
  });
};
export const useCompleteOnboardingItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.put<ApiSuccess<OnboardingItem>>(`/hr/onboarding/items/${id}/complete`, { notes }),
    onSuccess: () => { invalidate(qc, 'onboarding-workflows'); invalidate(qc, 'onboarding-workflow'); },
  });
};

// -- Letters --
export const useLetterTemplates = () => useQuery({
  queryKey: ['letter-templates'],
  queryFn: () => api.get<ApiSuccess<LetterTemplate[]>>('/hr/letter-templates'),
});
export const useCreateLetterTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<LetterTemplate>>('/hr/letter-templates', d),
    onSuccess: () => invalidate(qc, 'letter-templates'),
  });
};
export const useUpdateLetterTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<LetterTemplate>>(`/hr/letter-templates/${id}`, d),
    onSuccess: () => invalidate(qc, 'letter-templates'),
  });
};
export const useDeleteLetterTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<LetterTemplate>>(`/hr/letter-templates/${id}`),
    onSuccess: () => invalidate(qc, 'letter-templates'),
  });
};
export const useLetters = (q: { employeeId?: string; kind?: string } = {}) => {
  const params = new URLSearchParams();
  if (q.employeeId) params.set('employeeId', q.employeeId);
  if (q.kind) params.set('kind', q.kind);
  const qs = params.toString();
  return useQuery({
    queryKey: ['letters', q],
    queryFn: () => api.get<ApiSuccess<EmployeeLetter[]>>(`/hr/letters${qs ? `?${qs}` : ''}`),
  });
};
export const useLetter = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['letter', id],
  queryFn: () => api.get<ApiSuccess<EmployeeLetter>>(`/hr/letters/${id}`),
});
export const useGenerateLetter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { employeeId: string; templateId: string; extraTokens?: Record<string, string> }) =>
      api.post<ApiSuccess<EmployeeLetter>>('/hr/letters', d),
    onSuccess: () => invalidate(qc, 'letters'),
  });
};
export const useIssueLetter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put<ApiSuccess<EmployeeLetter>>(`/hr/letters/${id}/issue`, { sendEmail: false }),
    onSuccess: () => { invalidate(qc, 'letters'); invalidate(qc, 'letter'); },
  });
};
export const useRevokeLetter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put<ApiSuccess<EmployeeLetter>>(`/hr/letters/${id}/revoke`, {}),
    onSuccess: () => { invalidate(qc, 'letters'); invalidate(qc, 'letter'); },
  });
};
export const useFulfilLetterRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, templateId, extraTokens }: { id: string; templateId: string; extraTokens?: Record<string, string> }) =>
      api.post<ApiSuccess<EmployeeLetter>>(`/hr/letters/${id}/fulfil`, { templateId, extraTokens }),
    onSuccess: () => { invalidate(qc, 'letters'); invalidate(qc, 'letter'); },
  });
};
export const useDeleteLetter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<EmployeeLetter>>(`/hr/letters/${id}`),
    onSuccess: () => invalidate(qc, 'letters'),
  });
};

// -- Helpdesk --
export const useTickets = (q: { status?: string; category?: string; priority?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
  const qs = params.toString();
  return useQuery({
    queryKey: ['tickets', q],
    queryFn: () => api.get<ApiSuccess<HrTicket[]>>(`/hr/tickets${qs ? `?${qs}` : ''}`),
  });
};
export const useTicket = (id: string | null) => useQuery({
  enabled: !!id,
  queryKey: ['ticket', id],
  queryFn: () => api.get<ApiSuccess<HrTicket & { comments: HrTicketComment[] }>>(`/hr/tickets/${id}`),
});
export const useUpdateTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<HrTicket>>(`/hr/tickets/${id}`, d),
    onSuccess: () => { invalidate(qc, 'tickets'); invalidate(qc, 'ticket'); },
  });
};
export const useAgentSettings = () => useQuery({
  queryKey: ['helpdesk-agent-settings'],
  queryFn: () => api.get<ApiSuccess<HelpdeskAgentSettings>>('/hr/helpdesk/agent-settings'),
});
export const useUpdateAgentSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HelpdeskAgentSettings) =>
      api.put<ApiSuccess<HelpdeskAgentSettings>>('/hr/helpdesk/agent-settings', input),
    onSuccess: () => invalidate(qc, 'helpdesk-agent-settings'),
  });
};
export const useAgentOperators = () => useQuery({
  queryKey: ['helpdesk-agent-operators'],
  queryFn: () => api.get<ApiSuccess<Array<{ id: string; name: string; email: string; role: string }>>>('/hr/helpdesk/agent-settings/operators'),
});

export const useAddTicketComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api.post<ApiSuccess<HrTicketComment>>(`/hr/tickets/${id}/comments`, { body }),
    onSuccess: () => invalidate(qc, 'ticket'),
  });
};
export const useAcceptAgentDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, commentId, body }: { ticketId: string; commentId: string; body?: string }) =>
      api.post<ApiSuccess<HrTicketComment>>(
        `/hr/tickets/${ticketId}/agent-drafts/${commentId}/accept`,
        body ? { body } : {},
      ),
    onSuccess: () => { invalidate(qc, 'ticket'); invalidate(qc, 'tickets'); },
  });
};
export const useDiscardAgentDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, commentId }: { ticketId: string; commentId: string }) =>
      api.delete<ApiSuccess<{ id: string }>>(`/hr/tickets/${ticketId}/agent-drafts/${commentId}`),
    onSuccess: () => invalidate(qc, 'ticket'),
  });
};

// -- Performance --
export const usePerformanceCycles = () => useQuery({
  queryKey: ['performance-cycles'],
  queryFn: () => api.get<ApiSuccess<PerformanceCycle[]>>('/hr/performance/cycles'),
});
export const useCreatePerformanceCycle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<PerformanceCycle>>('/hr/performance/cycles', d),
    onSuccess: () => invalidate(qc, 'performance-cycles'),
  });
};
export const useUpdatePerformanceCycle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<PerformanceCycle>>(`/hr/performance/cycles/${id}`, d),
    onSuccess: () => invalidate(qc, 'performance-cycles'),
  });
};
export const useDeletePerformanceCycle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<PerformanceCycle>>(`/hr/performance/cycles/${id}`),
    onSuccess: () => invalidate(qc, 'performance-cycles'),
  });
};
export const usePerformanceGoals = (q: { cycleId?: string; employeeId?: string } = {}) => {
  const params = new URLSearchParams();
  if (q.cycleId) params.set('cycleId', q.cycleId);
  if (q.employeeId) params.set('employeeId', q.employeeId);
  const qs = params.toString();
  return useQuery({
    queryKey: ['performance-goals', q],
    queryFn: () => api.get<ApiSuccess<PerformanceGoal[]>>(`/hr/performance/goals${qs ? `?${qs}` : ''}`),
  });
};
export const useCreatePerformanceGoal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => api.post<ApiSuccess<PerformanceGoal>>('/hr/performance/goals', d),
    onSuccess: () => invalidate(qc, 'performance-goals'),
  });
};
export const useUpdatePerformanceGoal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => api.put<ApiSuccess<PerformanceGoal>>(`/hr/performance/goals/${id}`, d),
    onSuccess: () => invalidate(qc, 'performance-goals'),
  });
};
export const useGeneratePerformanceGoals = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cycleId: string;
      scope: 'single' | 'department' | 'designation' | 'all';
      employeeId?: string;
      departmentId?: string;
      designationId?: string;
    }) => api.post<ApiSuccess<{ generated: number; employees: number; goals: PerformanceGoal[] }>>(
      `/hr/performance/cycles/${input.cycleId}/generate-goals`,
      { scope: input.scope, employeeId: input.employeeId, departmentId: input.departmentId, designationId: input.designationId },
    ),
    onSuccess: () => invalidate(qc, 'performance-goals'),
  });
};
export const useBulkPublishGoals = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalIds: string[]) =>
      api.post<ApiSuccess<{ published: number }>>(`/hr/performance/goals/bulk-publish`, { goalIds }),
    onSuccess: () => invalidate(qc, 'performance-goals'),
  });
};
export const useDeletePerformanceGoal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiSuccess<PerformanceGoal>>(`/hr/performance/goals/${id}`),
    onSuccess: () => invalidate(qc, 'performance-goals'),
  });
};
export const usePerformanceReviews = (q: { cycleId?: string; employeeId?: string; status?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
  const qs = params.toString();
  return useQuery({
    queryKey: ['performance-reviews', q],
    queryFn: () => api.get<ApiSuccess<PerformanceReview[]>>(`/hr/performance/reviews${qs ? `?${qs}` : ''}`),
  });
};
export const useCreatePerformanceReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { cycleId: string; employeeId: string }) =>
      api.post<ApiSuccess<PerformanceReview>>('/hr/performance/reviews', d),
    onSuccess: () => invalidate(qc, 'performance-reviews'),
  });
};
export const useSubmitManagerReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) =>
      api.put<ApiSuccess<PerformanceReview>>(`/hr/performance/reviews/${id}/manager-submit`, d),
    onSuccess: () => invalidate(qc, 'performance-reviews'),
  });
};
export const useFinaliseReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) =>
      api.put<ApiSuccess<PerformanceReview>>(`/hr/performance/reviews/${id}/finalise`, d),
    onSuccess: () => invalidate(qc, 'performance-reviews'),
  });
};

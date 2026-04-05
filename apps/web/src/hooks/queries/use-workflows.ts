import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { ApprovalWorkflow, ApprovalInstance, TransactionComment, TaskAssignment, ActivityLogEntry, ApiSuccess } from '@runq/types';

const WF_KEYS = {
  workflows: ['workflows'] as const,
  instance: (entityType: string, entityId: string) => ['workflows', 'instance', entityType, entityId] as const,
  comments: (entityType: string, entityId: string) => ['workflows', 'comments', entityType, entityId] as const,
  tasks: (filters?: Record<string, string>) => ['workflows', 'tasks', filters] as const,
  activity: (entityType: string, entityId: string) => ['workflows', 'activity', entityType, entityId] as const,
};

export function useApprovalWorkflows() {
  return useQuery({
    queryKey: WF_KEYS.workflows,
    queryFn: () => api.get<ApiSuccess<ApprovalWorkflow[]>>('/workflows'),
  });
}

export function useCreateApprovalWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      entityType: string;
      rules: { stepOrder: number; approverRole: string; minAmount?: number | null; maxAmount?: number | null }[];
    }) => api.post<ApiSuccess<ApprovalWorkflow>>('/workflows', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: WF_KEYS.workflows }),
  });
}

export function useSubmitForApproval() {
  return useMutation({
    mutationFn: (data: { entityType: string; entityId: string; amount: number }) =>
      api.post<ApiSuccess<ApprovalInstance>>('/workflows/submit', data),
  });
}

export function useApprovalInstance(entityType: string, entityId: string) {
  return useQuery({
    queryKey: WF_KEYS.instance(entityType, entityId),
    queryFn: () => api.get<ApiSuccess<ApprovalInstance>>(`/workflows/instance?entityType=${entityType}&entityId=${entityId}`),
    enabled: !!entityType && !!entityId,
  });
}

export function useApprovalDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { stepId: string; instanceId: string; decision: 'approved' | 'rejected'; comment?: string }) =>
      api.put<ApiSuccess<ApprovalInstance>>(`/workflows/steps/${data.stepId}/decide?instanceId=${data.instanceId}`, {
        decision: data.decision,
        comment: data.comment,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['workflows', 'pending-approvals'],
    queryFn: () => api.get<ApiSuccess<ApprovalInstance[]>>('/workflows/pending-approvals'),
  });
}

export function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put<ApiSuccess<ApprovalWorkflow>>(`/workflows/${id}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: WF_KEYS.workflows }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: WF_KEYS.workflows }),
  });
}

export function useComments(entityType: string, entityId: string) {
  return useQuery({
    queryKey: WF_KEYS.comments(entityType, entityId),
    queryFn: () => api.get<ApiSuccess<TransactionComment[]>>(`/workflows/comments?entityType=${entityType}&entityId=${entityId}`),
    enabled: !!entityType && !!entityId,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { entityType: string; entityId: string; content: string }) =>
      api.post<ApiSuccess<TransactionComment>>('/workflows/comments', data),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: WF_KEYS.comments(vars.entityType, vars.entityId) }),
  });
}

export function useTasks(filters?: { assignedTo?: string; entityType?: string; entityId?: string }) {
  const params = new URLSearchParams();
  if (filters?.assignedTo) params.set('assignedTo', filters.assignedTo);
  if (filters?.entityType) params.set('entityType', filters.entityType);
  if (filters?.entityId) params.set('entityId', filters.entityId);
  const qs = params.toString();
  return useQuery({
    queryKey: WF_KEYS.tasks(filters as Record<string, string>),
    queryFn: () => api.get<ApiSuccess<TaskAssignment[]>>(`/workflows/tasks${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      entityType: string;
      entityId: string;
      title: string;
      description?: string;
      assignedTo: string;
      dueDate?: string;
    }) => api.post<ApiSuccess<TaskAssignment>>('/workflows/tasks', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows', 'tasks'] }),
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { taskId: string; status: string }) =>
      api.put<ApiSuccess<TaskAssignment>>(`/workflows/tasks/${data.taskId}/status`, { status: data.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows', 'tasks'] }),
  });
}

export function useActivityTimeline(entityType: string, entityId: string) {
  return useQuery({
    queryKey: WF_KEYS.activity(entityType, entityId),
    queryFn: () => api.get<ApiSuccess<ActivityLogEntry[]>>(`/workflows/activity?entityType=${entityType}&entityId=${entityId}`),
    enabled: !!entityType && !!entityId,
  });
}

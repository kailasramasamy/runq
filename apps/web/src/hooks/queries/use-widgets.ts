import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import type { DashboardWidget, ScheduledReport, ApiSuccess } from '@runq/types';

const WIDGET_KEYS = {
  widgets: ['dashboard', 'widgets'] as const,
  scheduledReports: ['dashboard', 'scheduled-reports'] as const,
};

export function useDashboardWidgets() {
  return useQuery({
    queryKey: WIDGET_KEYS.widgets,
    queryFn: () => api.get<ApiSuccess<DashboardWidget[]>>('/dashboard/widgets'),
  });
}

export function useSaveWidgetLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      widgets: { widgetType: string; position: number; config?: Record<string, unknown>; isVisible?: boolean }[];
    }) => api.put<ApiSuccess<DashboardWidget[]>>('/dashboard/widgets', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: WIDGET_KEYS.widgets }),
  });
}

export function useScheduledReports() {
  return useQuery({
    queryKey: WIDGET_KEYS.scheduledReports,
    queryFn: () => api.get<ApiSuccess<ScheduledReport[]>>('/dashboard/scheduled-reports'),
  });
}

export function useCreateScheduledReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      reportType: string;
      frequency: 'daily' | 'weekly' | 'monthly';
      recipients: string[];
      config?: Record<string, unknown>;
    }) => api.post<ApiSuccess<ScheduledReport>>('/dashboard/scheduled-reports', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: WIDGET_KEYS.scheduledReports }),
  });
}

export function useToggleScheduledReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.put<ApiSuccess<ScheduledReport>>(`/dashboard/scheduled-reports/${id}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: WIDGET_KEYS.scheduledReports }),
  });
}

export function useDeleteScheduledReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/dashboard/scheduled-reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: WIDGET_KEYS.scheduledReports }),
  });
}

export function useRunScheduledReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; message: string }>(`/dashboard/scheduled-reports/${id}/run`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: WIDGET_KEYS.scheduledReports }),
  });
}

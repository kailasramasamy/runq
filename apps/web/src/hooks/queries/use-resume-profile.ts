import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ApiSuccess, ResumeProfile } from '@runq/types';

/**
 * Hooks for the employee resume profile — the AI-extracted enrichment block
 * on the employee detail page. Upload goes through the dedicated HR route
 * (POST /hr/employees/:id/resume) which stores the file and extracts in one
 * step; edits are management corrections to the extracted data.
 */

const KEY = (employeeId: string) => ['hr', 'resume-profile', employeeId] as const;

export interface ResumeProfileInput {
  summary: string | null;
  experience: ResumeProfile['experience'];
  education: ResumeProfile['education'];
  skills: string[];
  certifications: ResumeProfile['certifications'];
  languages: string[];
  totalExpYears: number | null;
}

export function useResumeProfile(employeeId: string | null) {
  return useQuery({
    queryKey: KEY(employeeId ?? ''),
    queryFn: () =>
      api.get<ApiSuccess<ResumeProfile | null>>(
        `/hr/employees/${employeeId}/resume-profile`,
      ),
    enabled: !!employeeId,
  });
}

export function useUploadResume(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const json = await api.upload<ApiSuccess<ResumeProfile>>(
        `/hr/employees/${employeeId}/resume`,
        form,
      );
      return json.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(employeeId) });
      // The resume file lands in document_attachments too.
      qc.invalidateQueries({ queryKey: ['employee-documents', employeeId] });
    },
  });
}

export function useUpdateResumeProfile(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ResumeProfileInput) =>
      api.put<ApiSuccess<ResumeProfile>>(
        `/hr/employees/${employeeId}/resume-profile`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(employeeId) }),
  });
}

// ─── Self-service ─────────────────────────────────────────────────────────
// The logged-in employee's own resume — backs the My Profile page.

const ME_KEY = ['hr', 'my-resume-profile'] as const;

export function useMyResumeProfile(enabled = true) {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get<ApiSuccess<ResumeProfile | null>>('/hr/me/resume-profile'),
    enabled,
  });
}

export function useUploadMyResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const json = await api.upload<ApiSuccess<ResumeProfile>>('/hr/me/resume', form);
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

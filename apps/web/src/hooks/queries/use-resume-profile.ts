import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ApiSuccess, ResumeProfile } from '@runq/types';

/**
 * Hooks for the employee resume profile — the AI-extracted enrichment block
 * on the employee detail page. Upload goes through the dedicated HR route
 * (POST /hr/employees/:id/resume) which stores the file and extracts in one
 * step; edits are management corrections to the extracted data.
 */

const BASE_URL = '/api/v1';

const KEY = (employeeId: string) => ['hr', 'resume-profile', employeeId] as const;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('runq-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
      const res = await fetch(`${BASE_URL}/hr/employees/${employeeId}/resume`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      if (!res.ok) throw await res.json();
      return (await res.json()).data as ResumeProfile;
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
      const res = await fetch(`${BASE_URL}/hr/me/resume`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      if (!res.ok) throw await res.json();
      return (await res.json()).data as ResumeProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

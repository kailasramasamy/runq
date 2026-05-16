import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentAttachment, EmployeeDocumentKind } from '@runq/types';

/**
 * Hooks for HR-specific employee asset uploads:
 *   - Profile photo (employees.photo_url, single)
 *   - Categorised documents (document_attachments, kind-tagged, multi)
 *
 * The documents flow reuses the polymorphic /common/attachments routes
 * (entityType='employee') and threads the `kind` form field through.
 */

const BASE_URL = '/api/v1';

const KEYS = {
  documents: (employeeId: string) => ['employee-documents', employeeId] as const,
  photo: (employeeId: string) => ['employee-photo', employeeId] as const,
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('runq-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Documents ──────────────────────────────────────────────────────────────

async function fetchDocuments(employeeId: string): Promise<DocumentAttachment[]> {
  const res = await fetch(
    `${BASE_URL}/common/attachments/employee/${employeeId}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw await res.json();
  return (await res.json()).data;
}

async function uploadDocument(params: {
  employeeId: string;
  file: File;
  kind: EmployeeDocumentKind;
}): Promise<DocumentAttachment> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('kind', params.kind);
  const res = await fetch(
    `${BASE_URL}/common/attachments/employee/${params.employeeId}`,
    { method: 'POST', headers: authHeaders(), body: form },
  );
  if (!res.ok) throw await res.json();
  return (await res.json()).data;
}

async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/common/attachments/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw await res.json();
}

export function useEmployeeDocuments(employeeId: string) {
  return useQuery({
    queryKey: KEYS.documents(employeeId),
    queryFn: () => fetchDocuments(employeeId),
    enabled: !!employeeId,
  });
}

export function useUploadEmployeeDocument(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { file: File; kind: EmployeeDocumentKind }) =>
      uploadDocument({ employeeId, ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.documents(employeeId) }),
  });
}

export function useDeleteEmployeeDocument(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.documents(employeeId) }),
  });
}

/** Download URL — same /attachments/:id/download endpoint with auth bearer. */
export function documentDownloadUrl(id: string): string {
  return `${BASE_URL}/common/attachments/${id}/download`;
}

// ─── Profile photo ──────────────────────────────────────────────────────────

async function uploadPhoto(params: {
  employeeId: string;
  file: File;
}): Promise<{ storageKey: string }> {
  const form = new FormData();
  form.append('file', params.file);
  const res = await fetch(`${BASE_URL}/hr/employees/${params.employeeId}/photo`, {
    method: 'POST', headers: authHeaders(), body: form,
  });
  if (!res.ok) throw await res.json();
  return (await res.json()).data;
}

async function deletePhoto(employeeId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/hr/employees/${employeeId}/photo`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!res.ok) throw await res.json();
}

export function useUploadEmployeePhoto(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadPhoto({ employeeId, file }),
    onSuccess: () => {
      // Invalidate both the employee record (carries photoUrl) and the
      // dedicated photo cache key so any <img> using employeePhotoUrl(id)
      // refetches with a busted query string.
      qc.invalidateQueries({ queryKey: ['employee', employeeId] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: KEYS.photo(employeeId) });
    },
  });
}

export function useDeleteEmployeePhoto(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deletePhoto(employeeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', employeeId] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: KEYS.photo(employeeId) });
    },
  });
}

/**
 * Authenticated photo URL. The API streams the image, requiring a Bearer
 * token in headers — but <img src=…> can't carry headers. We blob-fetch on
 * demand via useEmployeePhotoSrc() instead.
 */
export function useEmployeePhotoSrc(employeeId: string, hasPhoto: boolean) {
  return useQuery({
    queryKey: KEYS.photo(employeeId),
    enabled: !!employeeId && hasPhoto,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/hr/employees/${employeeId}/photo`, {
        headers: authHeaders(),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    // Object URLs are cheap to refetch on remount; keep around for the session.
    staleTime: Infinity,
  });
}

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

/**
 * Invalidate every cache that carries an employee's photoUrl. The detail
 * page lives at ['hr','employees','detail',id] and the list at
 * ['hr','employees', filters] — both share the 'hr','employees' prefix, so
 * one invalidation catches all of them. Without this, the cached employee
 * record keeps the stale photoUrl and the avatar query never re-enables.
 */
function invalidatePhotoCaches(qc: ReturnType<typeof useQueryClient>, employeeId: string) {
  qc.invalidateQueries({ queryKey: ['hr', 'employees'] });
  qc.invalidateQueries({ queryKey: KEYS.photo(employeeId) });
}

export function useUploadEmployeePhoto(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadPhoto({ employeeId, file }),
    onSuccess: () => invalidatePhotoCaches(qc, employeeId),
  });
}

export function useDeleteEmployeePhoto(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deletePhoto(employeeId),
    onSuccess: () => invalidatePhotoCaches(qc, employeeId),
  });
}

/**
 * Authenticated photo URL. The API streams the image, requiring a Bearer
 * token in headers — but <img src=…> can't carry headers. We blob-fetch on
 * demand via useEmployeePhotoSrc() instead.
 *
 * `photoKey` is the current employees.photo_url value; including it in the
 * queryKey gives us automatic refetch when a new upload changes the key,
 * and `cache: 'no-cache'` forces revalidation past the server's 5-minute
 * Cache-Control. Without these, the browser would serve the old photo from
 * disk cache after an upload — see also useUploadEmployeePhoto.
 */
export function useEmployeePhotoSrc(employeeId: string, photoKey: string | null) {
  return useQuery({
    queryKey: [...KEYS.photo(employeeId), photoKey],
    enabled: !!employeeId && !!photoKey,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/hr/employees/${employeeId}/photo`, {
        headers: authHeaders(),
        cache: 'no-cache',
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    // Object URLs are cheap to refetch on remount; keep around for the session.
    staleTime: Infinity,
  });
}

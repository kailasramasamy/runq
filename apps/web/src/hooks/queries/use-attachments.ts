import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentAttachment, AttachmentEntityType } from '@runq/types';

const BASE_URL = '/api/v1';

const ATTACHMENT_KEYS = {
  byEntity: (entityType: string, entityId: string) =>
    ['attachments', entityType, entityId] as const,
};

function getToken(): string | null {
  return localStorage.getItem('runq-token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAttachments(
  entityType: string,
  entityId: string,
): Promise<DocumentAttachment[]> {
  const res = await fetch(
    `${BASE_URL}/common/attachments/${entityType}/${entityId}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw await res.json();
  const json = await res.json();
  return json.data;
}

async function uploadAttachment(params: {
  entityType: AttachmentEntityType;
  entityId: string;
  file: File;
}): Promise<DocumentAttachment> {
  const form = new FormData();
  form.append('file', params.file);

  const res = await fetch(
    `${BASE_URL}/common/attachments/${params.entityType}/${params.entityId}`,
    { method: 'POST', headers: authHeaders(), body: form },
  );
  if (!res.ok) throw await res.json();
  const json = await res.json();
  return json.data;
}

async function deleteAttachment(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/common/attachments/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw await res.json();
}

export function useAttachments(entityType: AttachmentEntityType, entityId: string) {
  return useQuery({
    queryKey: ATTACHMENT_KEYS.byEntity(entityType, entityId),
    queryFn: () => fetchAttachments(entityType, entityId),
    enabled: !!entityId,
  });
}

export function useUploadAttachment(entityType: AttachmentEntityType, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAttachment({ entityType, entityId, file }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ATTACHMENT_KEYS.byEntity(entityType, entityId) }),
  });
}

export function useDeleteAttachment(entityType: AttachmentEntityType, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ATTACHMENT_KEYS.byEntity(entityType, entityId) }),
  });
}

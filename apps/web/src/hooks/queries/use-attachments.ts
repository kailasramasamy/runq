import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiSuccess, DocumentAttachment, AttachmentEntityType } from '@runq/types';
import { api } from '../../lib/api-client';

const ATTACHMENT_KEYS = {
  byEntity: (entityType: string, entityId: string) =>
    ['attachments', entityType, entityId] as const,
};

async function fetchAttachments(
  entityType: string,
  entityId: string,
): Promise<DocumentAttachment[]> {
  const json = await api.get<ApiSuccess<DocumentAttachment[]>>(
    `/common/attachments/${entityType}/${entityId}`,
  );
  return json.data;
}

async function uploadAttachment(params: {
  entityType: AttachmentEntityType;
  entityId: string;
  file: File;
}): Promise<DocumentAttachment> {
  const form = new FormData();
  form.append('file', params.file);

  const json = await api.upload<ApiSuccess<DocumentAttachment>>(
    `/common/attachments/${params.entityType}/${params.entityId}`,
    form,
  );
  return json.data;
}

function deleteAttachment(id: string): Promise<void> {
  return api.delete(`/common/attachments/${id}`);
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

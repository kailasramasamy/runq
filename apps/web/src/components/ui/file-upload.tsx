import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Trash2, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/queries/use-attachments';
import type { AttachmentEntityType, DocumentAttachment } from '@runq/types';

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.csv'];
const MAX_SIZE = 10 * 1024 * 1024;

interface FileUploadProps {
  entityType: AttachmentEntityType;
  entityId: string;
  readonly?: boolean;
}

export function FileUpload({ entityType, entityId, readonly = false }: FileUploadProps) {
  const { data: attachments = [], isLoading } = useAttachments(entityType, entityId);
  const uploadMutation = useUploadAttachment(entityType, entityId);
  const deleteMutation = useDeleteAttachment(entityType, entityId);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-3">
      {!readonly && (
        <DropZone
          isUploading={uploadMutation.isPending}
          onFilesSelected={(files) => files.forEach((f) => uploadMutation.mutate(f))}
          error={uploadMutation.error ? String((uploadMutation.error as any)?.message ?? 'Upload failed') : undefined}
        />
      )}
      {attachments.length > 0 && (
        <AttachmentList
          attachments={attachments}
          readonly={readonly}
          deletingId={deleteMutation.isPending ? (deleteMutation.variables as string) : undefined}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-4 text-sm text-zinc-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading attachments...
    </div>
  );
}

interface DropZoneProps {
  isUploading: boolean;
  onFilesSelected: (files: File[]) => void;
  error?: string;
}

function DropZone({ isUploading, onFilesSelected, error }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const valid: File[] = [];
      for (const file of Array.from(fileList)) {
        const err = validateFile(file);
        if (err) {
          setValidationError(err);
          return;
        }
        valid.push(file);
      }
      setValidationError(null);
      onFilesSelected(valid);
    },
    [onFilesSelected],
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors',
          dragOver
            ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/10'
            : 'border-zinc-300 hover:border-indigo-300 dark:border-zinc-700 dark:hover:border-indigo-600',
          isUploading && 'pointer-events-none opacity-60',
        )}
      >
        {isUploading ? (
          <Loader2 className="mb-2 h-6 w-6 animate-spin text-indigo-500" />
        ) : (
          <Upload className="mb-2 h-6 w-6 text-zinc-400" />
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {isUploading ? 'Uploading...' : 'Drop files here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          PDF, PNG, JPG, XLSX, CSV up to 10 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ALLOWED_EXTENSIONS.join(',')}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {(validationError || error) && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {validationError ?? error}
        </p>
      )}
    </div>
  );
}

interface AttachmentListProps {
  attachments: DocumentAttachment[];
  readonly: boolean;
  deletingId?: string;
  onDelete: (id: string) => void;
}

function AttachmentList({ attachments, readonly, deletingId, onDelete }: AttachmentListProps) {
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
      {attachments.map((att) => (
        <li key={att.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">
              {att.fileName}
            </span>
            <span className="shrink-0 text-xs text-zinc-400">
              {formatSize(att.fileSize)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={`/api/v1/common/attachments/${att.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
            {!readonly && (
              <button
                onClick={() => onDelete(att.id)}
                disabled={deletingId === att.id}
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                title="Delete"
              >
                {deletingId === att.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function validateFile(file: File): string | null {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type ${ext} is not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_SIZE) {
    return `File "${file.name}" exceeds 10 MB limit`;
  }
  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Loader2, FileText, ClipboardPaste, Image as ImageIcon, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { Button, Modal, useToast } from '@/components/ui';
import {
  useUploadOrderFile,
  useUploadOrderText,
  useDiscardOrderUpload,
  isCustomerOrderDuplicateError,
  type CustomerOrderSourceChannel,
  type CustomerOrderUploadStatus,
} from '@/hooks/queries/use-customer-orders';
import { isIos } from '@/lib/pwa-install';

interface DuplicateState {
  fileName: string;
  duplicateOfUploadId: string;
  status: CustomerOrderUploadStatus;
  retry: () => Promise<void>;
}

const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const ALLOWED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xls,.xlsx';
const MAX_SIZE = 10 * 1024 * 1024;

interface Props {
  /**
   * Whether the global paste handler should be active. The inbox page sets
   * this true while mounted so accountants can Cmd+V from anywhere on the
   * page (image, screenshot, or text from WhatsApp Web). Other contexts can
   * disable it to avoid stealing paste events.
   */
  capturePaste?: boolean;
}

/**
 * The single upload surface used by the Customer orders. Handles:
 *   - drag-and-drop of files (downloaded PDFs, native WhatsApp Desktop drag, etc.)
 *   - click-to-browse (universal fallback)
 *   - clipboard paste — type-detects:
 *       • image blob       → image upload
 *       • text/plain       → "quick text order" via /po-uploads/text
 *       • file (rare)      → file upload
 *
 * All routes feed the same backend pipeline so the parser doesn't care
 * which entry point was used.
 */
export function CustomerOrderUploadZone({ capturePaste = true }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const uploadFile = useUploadOrderFile();
  const uploadText = useUploadOrderText();
  const discardUpload = useDiscardOrderUpload();
  const [duplicate, setDuplicate] = useState<DuplicateState | null>(null);

  const isUploading = uploadFile.isPending || uploadText.isPending;

  const sendFile = useCallback(
    async (file: File, source: CustomerOrderSourceChannel) => {
      const validation = validateFile(file);
      if (validation) {
        toast(validation, 'error');
        return;
      }
      try {
        await uploadFile.mutateAsync({ file, source });
        toast(`Uploaded ${file.name}`, 'success');
      } catch (err) {
        // Duplicate hash → open the resolver dialog with the existing upload's
        // id and a retry closure. Keeps the user out of toast-and-guess loops
        // and gives them the two viable next steps in one place.
        if (isCustomerOrderDuplicateError(err)) {
          setDuplicate({
            fileName: file.name,
            duplicateOfUploadId: err.details.duplicateOfUploadId,
            status: err.details.status,
            retry: () => sendFile(file, source),
          });
          return;
        }
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      }
    },
    [uploadFile, toast],
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3) {
        toast('Pasted text is too short to be an order', 'error');
        return;
      }
      try {
        await uploadText.mutateAsync({ text: trimmed });
        toast('Quick text order captured', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      }
    },
    [uploadText, toast],
  );

  const handleFiles = useCallback(
    (fileList: FileList | File[] | null, source: CustomerOrderSourceChannel) => {
      if (!fileList) return;
      const files = Array.from(fileList);
      for (const file of files) {
        void sendFile(file, source);
      }
    },
    [sendFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files, 'web_drop');
    },
    [handleFiles],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files, 'web_upload');
      // Allow re-selecting the same file after upload
      if (inputRef.current) inputRef.current.value = '';
    },
    [handleFiles],
  );

  // ─── Global paste handler ───────────────────────────────────────────────
  useEffect(() => {
    if (!capturePaste) return;

    const onPaste = (e: ClipboardEvent) => {
      // Don't hijack paste in editable fields (forms, textareas, contenteditables).
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;

      const cd = e.clipboardData;
      if (!cd) return;

      // 1) Files (rare on web but native WA Desktop sometimes provides them)
      if (cd.files && cd.files.length > 0) {
        e.preventDefault();
        const file = cd.files[0]!;
        // Heuristic: an image file from clipboard is almost always a paste_image
        const source: CustomerOrderSourceChannel = file.type.startsWith('image/') ? 'paste_image' : 'web_drop';
        void sendFile(file, source);
        return;
      }

      // 2) Image item (most common — copied from WA Web or screenshot)
      if (cd.items) {
        for (const item of Array.from(cd.items)) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              e.preventDefault();
              const named = new File(
                [blob],
                `paste-${Date.now()}.${blob.type.split('/')[1] || 'png'}`,
                { type: blob.type },
              );
              void sendFile(named, 'paste_image');
              return;
            }
          }
        }
      }

      // 3) Text fallback (WA Web message text, free-form orders)
      const text = cd.getData('text/plain');
      if (text && text.trim().length > 0) {
        e.preventDefault();
        void sendText(text);
      }
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [capturePaste, sendFile, sendText]);

  const navigate = useNavigate();

  const handleOpenExisting = useCallback(() => {
    if (!duplicate) return;
    const id = duplicate.duplicateOfUploadId;
    setDuplicate(null);
    navigate({ to: '/finance/ar/customer-orders/$uploadId' as never, params: { uploadId: id } as never });
  }, [duplicate, navigate]);

  const handleDiscardAndRetry = useCallback(async () => {
    if (!duplicate) return;
    try {
      await discardUpload.mutateAsync(duplicate.duplicateOfUploadId);
      const retry = duplicate.retry;
      setDuplicate(null);
      await retry();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not discard the existing order', 'error');
    }
  }, [duplicate, discardUpload, toast]);

  return (
    <>
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors',
        dragOver
          ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/10'
          : 'border-zinc-300 hover:border-indigo-300 dark:border-zinc-700 dark:hover:border-indigo-600',
        isUploading && 'pointer-events-none opacity-60',
      )}
      role="button"
      tabIndex={0}
    >
      {isUploading ? (
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
      ) : (
        <Upload className="h-7 w-7 text-zinc-400" />
      )}
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {isUploading ? 'Uploading…' : 'Drop an order, paste an image, or click to browse'}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        PDF · PNG · JPG · CSV · XLS · text — up to 10 MB
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" /> drag a file
        </span>
        <span className="inline-flex items-center gap-1">
          <ImageIcon className="h-3 w-3" /> paste an image
        </span>
        <span className="inline-flex items-center gap-1">
          <ClipboardPaste className="h-3 w-3" /> paste WhatsApp text
        </span>
      </div>
      {isIos() && (
        <p className="mt-1 text-[11px] text-zinc-400">
          On iPhone: tap PDF in WhatsApp → <strong>Save to Files</strong> → open runq → drag here
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ALLOWED_EXTENSIONS}
        multiple
        onChange={onFileInput}
        onClick={(e) => e.stopPropagation()}
      />
    </div>

    <Modal
      open={duplicate !== null}
      onClose={() => setDuplicate(null)}
      title="This order is already in your inbox"
      size="sm"
    >
      {duplicate && (
        <div className="flex flex-col gap-4 text-sm text-zinc-700 dark:text-zinc-200">
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/10">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-[13px] text-amber-900 dark:text-amber-100">
              <p className="font-medium">{duplicate.fileName}</p>
              <p className="mt-1 text-amber-800/90 dark:text-amber-100/80">
                The exact same file (byte-for-byte) is already in your customer orders with status{' '}
                <span className="font-mono text-[12px]">{duplicate.status}</span>.
                We block duplicates so you don't accidentally create two invoices for one order.
              </p>
            </div>
          </div>

          <div>
            <p className="font-medium text-zinc-800 dark:text-zinc-100">What would you like to do?</p>
            <ul className="mt-2 space-y-2 text-[13px] text-zinc-600 dark:text-zinc-300">
              <li className="flex gap-2">
                <span className="text-zinc-400">1.</span>
                <span>
                  <strong>Open the existing order</strong> — review the draft that was already created.
                  This is the right choice if your customer simply re-sent the same file.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-zinc-400">2.</span>
                <span>
                  <strong>Discard old & re-upload</strong> — only do this if the previous parse failed
                  and you want to try again. The old upload will be removed.
                </span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-3 sm:flex-row sm:justify-end dark:border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setDuplicate(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscardAndRetry}
              loading={discardUpload.isPending || uploadFile.isPending}
            >
              <Trash2 size={14} /> Discard old &amp; re-upload
            </Button>
            <Button size="sm" onClick={handleOpenExisting}>
              <ExternalLink size={14} /> Open existing order
            </Button>
          </div>
        </div>
      )}
    </Modal>
    </>
  );
}

function validateFile(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty`;
  if (file.size > MAX_SIZE) return `${file.name} exceeds 10 MB limit`;
  if (!ALLOWED_MIMES.has(file.type) && file.type !== '') {
    return `${file.type || 'this file type'} is not supported`;
  }
  return null;
}

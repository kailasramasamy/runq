import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Loader2, FileText, ClipboardPaste, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui';
import { useUploadPoFile, useUploadPoText, type PoSourceChannel } from '@/hooks/queries/use-po-inbox';
import { isIos } from '@/lib/pwa-install';

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
 * The single upload surface used by the PO Inbox. Handles:
 *   - drag-and-drop of files (downloaded PDFs, native WhatsApp Desktop drag, etc.)
 *   - click-to-browse (universal fallback)
 *   - clipboard paste — type-detects:
 *       • image blob       → image upload
 *       • text/plain       → "quick text PO" via /po-uploads/text
 *       • file (rare)      → file upload
 *
 * All routes feed the same backend pipeline so the parser doesn't care
 * which entry point was used.
 */
export function PoUploadZone({ capturePaste = true }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const uploadFile = useUploadPoFile();
  const uploadText = useUploadPoText();

  const isUploading = uploadFile.isPending || uploadText.isPending;

  const sendFile = useCallback(
    async (file: File, source: PoSourceChannel) => {
      const validation = validateFile(file);
      if (validation) {
        toast(validation, 'error');
        return;
      }
      try {
        await uploadFile.mutateAsync({ file, source });
        toast(`Uploaded ${file.name}`, 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      }
    },
    [uploadFile, toast],
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3) {
        toast('Pasted text is too short to be a PO', 'error');
        return;
      }
      try {
        await uploadText.mutateAsync({ text: trimmed });
        toast('Quick text PO captured', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      }
    },
    [uploadText, toast],
  );

  const handleFiles = useCallback(
    (fileList: FileList | File[] | null, source: PoSourceChannel) => {
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
        const source: PoSourceChannel = file.type.startsWith('image/') ? 'paste_image' : 'web_drop';
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

  return (
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
        {isUploading ? 'Uploading…' : 'Drop a PO, paste an image, or click to browse'}
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

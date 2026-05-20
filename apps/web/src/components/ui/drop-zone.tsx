import { useState, useCallback, useRef } from 'react';
import { Check, X, FileUp } from 'lucide-react';

interface DropZoneProps {
  fileName: string | null;
  onFile: (name: string, content: string) => void;
  onClear: () => void;
  accept?: string;
}

export function DropZone({ fileName, onFile, onClear, accept = '.csv' }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) onFile(file.name, text);
    };
    reader.readAsText(file);
  }, [onFile]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = '';
  }

  if (fileName) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-900/20">
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Check size={16} />
          <span className="font-medium">{fileName}</span>
        </div>
        <button
          onClick={onClear}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={[
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors',
        dragging
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600',
      ].join(' ')}
    >
      <FileUp size={28} className="mb-2 text-zinc-400" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-[var(--accent-text)]">Click to upload</span> or drag and drop
      </p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">CSV files only</p>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
    </div>
  );
}

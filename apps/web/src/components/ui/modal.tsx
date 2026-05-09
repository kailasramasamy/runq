import { useEffect } from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-7xl',
};

export function Modal({ open, onClose, title, children, wide, size }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Legacy: equivalent to size='lg'. Prefer the `size` prop. */
  wide?: boolean;
  size?: ModalSize;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-2 pt-[4vh] sm:p-4 sm:pt-[8vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={`relative flex w-full max-h-[90vh] flex-col ${SIZE_CLASS[size ?? (wide ? 'lg' : 'md')]} rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900`}>
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4 dark:border-zinc-800">
          <h2 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

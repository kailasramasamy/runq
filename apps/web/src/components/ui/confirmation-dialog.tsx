import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

type DialogVariant = 'danger' | 'warning';

interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: DialogVariant;
  loading?: boolean;
}

const confirmVariant: Record<DialogVariant, 'destructive' | 'primary'> = {
  danger: 'destructive',
  warning: 'primary',
};

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading,
}: ConfirmationDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={cn(
        'relative w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl',
        'dark:border-zinc-700 dark:bg-zinc-900',
      )}>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="mb-4 flex items-center gap-3">
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            variant === 'danger' ? 'bg-red-100 dark:bg-red-500/20' : 'bg-amber-100 dark:bg-amber-500/20',
          )}>
            <AlertTriangle size={20} className={variant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'} />
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        </div>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={confirmVariant[variant]} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { CheckCircle, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
};

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = icons[t.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(t.id), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [t.id, onDismiss]);

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg',
      'animate-in slide-in-from-bottom-2 fade-in duration-200',
      variantClasses[t.variant],
    )}>
      <Icon size={16} className="shrink-0" />
      <span className="flex-1 font-medium">{t.message}</span>
      <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

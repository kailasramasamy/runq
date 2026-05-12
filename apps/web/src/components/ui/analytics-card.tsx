import { ReactNode } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalyticsCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyHint?: string;
  onDrillDown?: () => void;
  drillDownLabel?: string;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function AnalyticsCard({
  title,
  subtitle,
  actions,
  loading,
  error,
  empty,
  emptyHint = 'No data yet',
  onDrillDown,
  drillDownLabel = 'View all',
  footer,
  className,
  children,
}: AnalyticsCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      <div className="flex-1 px-4 py-3">
        {loading ? (
          <CardSkeleton />
        ) : error ? (
          <CardError message={error} />
        ) : empty ? (
          <CardEmpty hint={emptyHint} />
        ) : (
          children
        )}
      </div>

      {(footer || onDrillDown) && !loading && !error && !empty && (
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-[12px] dark:border-zinc-800">
          <div className="text-zinc-500 dark:text-zinc-400">{footer}</div>
          {onDrillDown && (
            <button
              type="button"
              onClick={onDrillDown}
              className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              {drillDownLabel}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-7 w-3/5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

function CardError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px] text-red-600 dark:text-red-400">
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function CardEmpty({ hint }: { hint: string }) {
  return <p className="text-[12.5px] text-zinc-400 dark:text-zinc-500">{hint}</p>;
}

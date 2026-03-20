import { cn } from '../../lib/utils';
import { formatINR } from '../../lib/utils';

interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const variantStyles = {
  default: 'border-zinc-200 dark:border-zinc-800',
  success: 'border-green-200 dark:border-green-900',
  warning: 'border-amber-200 dark:border-amber-900',
  danger: 'border-red-200 dark:border-red-900',
};

export function MetricCard({ title, value, subtitle, variant = 'default' }: MetricCardProps) {
  return (
    <div className={cn('rounded-lg border bg-white dark:bg-zinc-900 p-4 shadow-sm', variantStyles[variant])}>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(value)}</p>
      {subtitle && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{subtitle}</p>}
    </div>
  );
}

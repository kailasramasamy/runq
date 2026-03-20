import { TrendingDown, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: number;
  icon?: LucideIcon;
  trend?: number;
  onClick?: () => void;
  className?: string;
  formatValue?: (v: number) => string;
}

export function StatsCard({ title, value, icon: Icon, trend, onClick, className, formatValue }: StatsCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const displayValue = formatValue ? formatValue(value) : formatINR(value);

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn(
        'relative overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900',
        onClick && 'cursor-pointer transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        className,
      )}
    >
      {Icon && (
        <div className="absolute right-4 top-4 opacity-5 dark:opacity-10">
          <Icon size={48} />
        </div>
      )}
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {displayValue}
      </p>
      {trend !== undefined && (
        <div className={cn(
          'mt-2 flex items-center gap-1 text-xs font-medium',
          isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
        )}>
          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span>{isPositive ? '+' : ''}{trend.toFixed(1)}% vs last period</span>
        </div>
      )}
    </div>
  );
}

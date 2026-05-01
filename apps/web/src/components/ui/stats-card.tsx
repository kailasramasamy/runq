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
        <div className="pointer-events-none absolute right-3 top-3 opacity-5 dark:opacity-10">
          <Icon className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12" />
        </div>
      )}
      <p className="mb-1 truncate pr-8 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 sm:text-xs">
        {title}
      </p>
      <p className="truncate font-mono text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 sm:text-xl lg:text-2xl">
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

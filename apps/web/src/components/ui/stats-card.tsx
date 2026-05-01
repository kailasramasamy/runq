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
  /** "default" = fixed text-2xl (matches inline stat tiles).
   *  "compact" = responsive sm/base/lg/xl/base — use when many cards share a row at narrow widths. */
  size?: 'default' | 'compact';
}

export function StatsCard({ title, value, icon: Icon, trend, onClick, className, formatValue, size = 'default' }: StatsCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  const displayValue = formatValue ? formatValue(value) : formatINR(value);

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn(
        'relative overflow-hidden rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4',
        onClick && 'cursor-pointer transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        className,
      )}
    >
      {Icon && (
        <div className={cn(
          'pointer-events-none absolute right-2 top-2 opacity-5 dark:opacity-10',
          size === 'compact' ? 'hidden xl:block' : '',
        )}>
          <Icon className={size === 'compact' ? 'h-10 w-10 2xl:h-12 2xl:w-12' : 'h-12 w-12'} />
        </div>
      )}
      <p className={cn(
        'mb-1 font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400',
        size === 'compact'
          ? 'text-[10px] sm:text-[11px] lg:text-xs'
          : 'text-xs',
      )}>
        {title}
      </p>
      <p className={cn(
        'font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100',
        size === 'compact'
          ? 'text-sm sm:text-base md:text-lg lg:text-xl 2xl:text-base'
          : 'text-2xl',
      )}>
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

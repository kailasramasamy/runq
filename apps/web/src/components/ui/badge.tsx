import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'primary'
  | 'cyan'
  | 'outline';

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-400',
  success:
    'bg-green-100 text-green-700 dark:bg-green-500/30 dark:text-green-400',
  warning:
    'bg-amber-100 text-amber-700 dark:bg-amber-500/30 dark:text-amber-400',
  danger:
    'bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-400',
  info:
    'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-400',
  primary:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-400',
  cyan:
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/30 dark:text-cyan-400',
  outline:
    'border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-400',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

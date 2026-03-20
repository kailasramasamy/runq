import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <Icon size={24} className="text-zinc-400 dark:text-zinc-500" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {description && (
        <p className="mb-4 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

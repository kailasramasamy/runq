import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** If set, renders a "Read the guide →" link below the action that deep-links into /help. */
  helpHref?: string;
  /** Override the help link label (defaults to "Read the step-by-step guide"). */
  helpLabel?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className, helpHref, helpLabel }: EmptyStateProps) {
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
      {helpHref && (
        <Link
          to={helpHref as '/finance/help'}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <BookOpen size={12} />
          {helpLabel ?? 'Read the step-by-step guide'}
        </Link>
      )}
    </div>
  );
}

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cn('flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400', className)}>
      {items.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} className="shrink-0" />}
          {crumb.href ? (
            <a href={crumb.href} className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-150">
              {crumb.label}
            </a>
          ) : (
            <span className="text-zinc-700 dark:text-zinc-200 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} className="mb-2" />
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

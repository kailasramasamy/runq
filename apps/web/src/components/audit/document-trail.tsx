import { Link } from '@tanstack/react-router';
import { useDocumentTrail } from '@/hooks/queries/use-trail';
import type { TrailNode } from '@/hooks/queries/use-trail';
import {
  Landmark, FileText, CreditCard, Receipt, BookOpen,
  Store, User, AlertTriangle, CheckCircle2,
} from 'lucide-react';

const TYPE_CONFIG: Record<string, { icon: typeof Landmark; color: string; label: string }> = {
  bank_transaction: { icon: Landmark, color: 'text-blue-500', label: 'Bank Transaction' },
  purchase_invoice: { icon: FileText, color: 'text-orange-500', label: 'Bill' },
  sales_invoice: { icon: FileText, color: 'text-green-500', label: 'Invoice' },
  payment: { icon: CreditCard, color: 'text-red-500', label: 'Payment' },
  receipt: { icon: Receipt, color: 'text-emerald-500', label: 'Receipt' },
  journal_entry: { icon: BookOpen, color: 'text-indigo-500', label: 'Journal Entry' },
  vendor: { icon: Store, color: 'text-amber-500', label: 'Vendor' },
  customer: { icon: User, color: 'text-cyan-500', label: 'Customer' },
};

interface Props {
  entityType: string;
  entityId: string;
}

export function DocumentTrail({ entityType, entityId }: Props) {
  const { data, isLoading } = useDocumentTrail(entityType, entityId);
  const trail = data?.data;

  if (isLoading) {
    return (
      <div className="py-4 text-xs text-zinc-400">Loading trail...</div>
    );
  }

  if (!trail) return null;

  const allNodes = [trail.root, ...trail.chain];
  const hasGaps = trail.gaps.length > 0;

  return (
    <div className="space-y-0">
      {/* Status badge */}
      <div className="mb-3 flex items-center gap-1.5">
        {hasGaps ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {trail.gaps.length} gap{trail.gaps.length > 1 ? 's' : ''} found
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Complete — no gaps
            </span>
          </>
        )}
      </div>

      {/* Timeline */}
      <div className="relative ml-2">
        {allNodes.map((node, i) => (
          <TrailNodeRow key={`${node.type}-${node.id}`} node={node} isLast={i === allNodes.length - 1 && trail.gaps.length === 0} />
        ))}

        {/* Gap warnings */}
        {trail.gaps.map((gap, i) => (
          <div key={i} className="relative flex items-start gap-3 pb-3">
            <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            </div>
            <div className="pt-0.5 text-xs text-amber-600 dark:text-amber-400">
              {gap}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrailNodeRow({ node, isLast }: { node: TrailNode; isLast: boolean }) {
  const config = TYPE_CONFIG[node.type] ?? { icon: FileText, color: 'text-zinc-500', label: node.type };
  const Icon = config.icon;

  return (
    <div className="relative flex items-start gap-3 pb-3">
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-[9px] top-5 bottom-0 w-px bg-zinc-200 dark:bg-zinc-700" />
      )}

      {/* Icon dot */}
      <div className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 ${config.color}`}>
        <Icon className="h-3 w-3" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {config.label}
          </span>
          {node.date && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{node.date}</span>
          )}
          {node.status && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {node.status}
            </span>
          )}
        </div>
        <Link
          to={node.url as '/'}
          className="block truncate text-sm text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400"
        >
          {node.label}
        </Link>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{node.summary}</p>
      </div>
    </div>
  );
}

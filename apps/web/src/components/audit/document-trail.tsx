import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useDocumentTrail, fixEntity } from '@/hooks/queries/use-trail';
import type { TrailNode, FixResult } from '@/hooks/queries/use-trail';
import { useQueryClient } from '@tanstack/react-query';
import {
  Landmark, FileText, CreditCard, Receipt, BookOpen,
  Store, User, AlertTriangle, CheckCircle2, Wrench, Loader2,
  ArrowRight, Info, Building2,
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
  fixed_asset: { icon: Building2, color: 'text-teal-500', label: 'Fixed Asset' },
};

interface Props {
  entityType: string;
  entityId: string;
}

export function DocumentTrail({ entityType, entityId }: Props) {
  const { data, isLoading } = useDocumentTrail(entityType, entityId);
  const trail = data?.data;
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [fixing, setFixing] = useState(false);
  const qc = useQueryClient();

  if (isLoading) {
    return <div className="py-4 text-xs text-zinc-400">Loading trail...</div>;
  }
  if (!trail) return null;

  const allNodes = [trail.root, ...trail.chain];
  const hasGaps = trail.gaps.length > 0;

  async function handleFix() {
    setFixing(true);
    try {
      const res = await fixEntity(entityType, entityId);
      setFixResult(res.data);
      qc.invalidateQueries({ queryKey: ['document-trail'] });
      qc.invalidateQueries({ queryKey: ['bank-transactions'] });
      qc.invalidateQueries({ queryKey: ['gap-scan'] });
    } catch {
      setFixResult({ steps: [{ action: 'Fix', result: 'Failed — try again', success: false }], allFixed: false, manualRequired: [] });
    }
    setFixing(false);
  }

  return (
    <div className="space-y-0">
      {/* Status + Fix button */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {hasGaps && !fixResult ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {trail.gaps.length} gap{trail.gaps.length > 1 ? 's' : ''} found
              </span>
            </>
          ) : fixResult?.allFixed ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Fixed</span>
            </>
          ) : !hasGaps && !fixResult ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Complete — no gaps</span>
            </>
          ) : null}
        </div>

        {hasGaps && !fixResult && (
          <button
            type="button"
            onClick={handleFix}
            disabled={fixing}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {fixing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
            {fixing ? 'Fixing...' : 'Auto-Fix'}
          </button>
        )}
      </div>

      {/* Fix result steps */}
      {fixResult && (
        <div className="mb-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">What was done</p>
          <div className="space-y-1.5">
            {fixResult.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {step.success ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <div>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{step.action}</span>
                  <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">— {step.result}</span>
                </div>
              </div>
            ))}
          </div>

          {fixResult.manualRequired.length > 0 && (
            <div className="mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-700">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <Info className="h-3 w-3" /> Manual steps required
              </p>
              {fixResult.manualRequired.map((step, i) => (
                <p key={i} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
                  {step}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative ml-2">
        {allNodes.map((node, i) => (
          <TrailNodeRow key={`${node.type}-${node.id}`} node={node} isLast={i === allNodes.length - 1 && trail.gaps.length === 0} />
        ))}

        {/* Gap warnings (only show if not fixed) */}
        {!fixResult && trail.gaps.map((gap, i) => (
          <div key={i} className="relative flex items-start gap-3 pb-3">
            <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            </div>
            <div className="pt-0.5 text-xs text-amber-600 dark:text-amber-400">{gap}</div>
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
      {!isLast && (
        <div className="absolute left-[9px] top-5 bottom-0 w-px bg-zinc-200 dark:bg-zinc-700" />
      )}
      <div className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 ${config.color}`}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{config.label}</span>
          {node.date && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{node.date}</span>}
          {node.status && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{node.status}</span>
          )}
        </div>
        <Link to={node.url as '/'} className="block truncate text-sm text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400">
          {node.label}
        </Link>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{node.summary}</p>
      </div>
    </div>
  );
}

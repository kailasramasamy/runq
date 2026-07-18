import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowUpRight, ChevronDown, ShieldCheck } from 'lucide-react';
import { Card, CardContent, Badge, Skeleton } from '@/components/ui';
import {
  useBillingSanityCheck, type BillingPeriodSel, type MpSanityIssue,
} from '@/hooks/queries/use-milk-procurement';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const TITLES: Record<MpSanityIssue['code'], string> = {
  unpriced_receipt: 'Unpriced collection',
  orphan_pour: 'Unbilled pours',
  qty_spike: 'Unusual quantity',
  no_payee_vendor: 'No payee vendor',
  operator_payout_overlap: 'Commission already recorded',
};

/** Auto-running pre-flight panel: surfaces unbilled pours, unpriced manual VMCC
 *  collections, and settlement blockers before bills are generated. */
export function SanityCheckPanel({ ccNodeId, period }: { ccNodeId: string; period: BillingPeriodSel }) {
  const { data, isLoading } = useBillingSanityCheck({ ...period, ccNodeId });
  const [open, setOpen] = useState(true);

  if (isLoading) {
    return <Card><CardContent className="pt-4"><Skeleton className="h-9 w-full rounded" /></CardContent></Card>;
  }
  const report = data?.data;
  if (!report) return null;
  const { issues } = report;
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const clear = issues.length === 0;

  return (
    <Card>
      <CardContent className="pt-4">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left">
          <div className="flex flex-wrap items-center gap-2">
            {clear
              ? <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              : <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Pre-generation sanity check</h2>
            {clear ? (
              <Badge variant="success">All clear</Badge>
            ) : (
              <>
                {errors > 0 && <Badge variant="danger">{errors} error{errors > 1 ? 's' : ''}</Badge>}
                {warnings > 0 && <Badge variant="warning">{warnings} warning{warnings > 1 ? 's' : ''}</Badge>}
              </>
            )}
          </div>
          {!clear && <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>
        {clear ? (
          <p className="mt-1 text-xs text-zinc-500">
            Checked {report.checkedVmccs} VMCC{report.checkedVmccs === 1 ? '' : 's'} — no unbilled pours or unpriced collections found.
          </p>
        ) : open && (
          <ul className="mt-3 space-y-2">
            {issues.map((it, i) => <IssueRow key={`${it.code}-${it.vmccNodeId ?? it.label}-${i}`} issue={it} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function IssueRow({ issue }: { issue: MpSanityIssue }) {
  const err = issue.severity === 'error';
  return (
    <li className={`rounded-md border px-3 py-2 ${err
      ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
      : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`text-xs font-semibold uppercase tracking-wide ${err
              ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {TITLES[issue.code]}
            </span>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{issue.label}</span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{issue.detail}</p>
          {issue.vmccNodeId && (
            <Link to="/milk-procurement/nodes/$id" params={{ id: issue.vmccNodeId }}
              className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Open VMCC<ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        {issue.amount > 0 && (
          <span className="shrink-0 tabular-nums text-xs font-medium text-zinc-700 dark:text-zinc-300">{inr(issue.amount)}</span>
        )}
      </div>
    </li>
  );
}

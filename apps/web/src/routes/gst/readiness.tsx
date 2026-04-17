import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle, AlertTriangle, ChevronDown, ChevronRight,
  ExternalLink, Calendar, Shield,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import {
  PageHeader, Card, CardHeader, CardContent, Badge, Button,
  CardSkeleton,
} from '@/components/ui';

// ── Types ──────────────────────────────────────────────────────────────

interface AffectedItem {
  id: string;
  label: string;
  sublabel?: string;
  link?: string;
}

interface SignalDetail {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  howToFix?: string;
  affectedItems: AffectedItem[];
}

function useReadinessDetails() {
  return useQuery({
    queryKey: ['gst', 'readiness', 'details'],
    queryFn: () => api.get<{ data: SignalDetail[] }>('/gst/readiness/details'),
    staleTime: 60_000,
  });
}

function useReadiness() {
  return useQuery({
    queryKey: ['gst', 'readiness'],
    queryFn: () => api.get<{ data: { period: string; periodLabel: string; score: number; dueDates: { gstr1: string; gstr3b: string }; returns: { gstr1: { exists: boolean; status: string | null }; gstr3b: { exists: boolean; status: string | null } }; filedExternally?: boolean; filingStartLabel?: string; preparing?: boolean } }>('/gst/readiness'),
    staleTime: 60_000,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function scoreColor(score: number) {
  if (score >= 90) return { bg: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
  if (score >= 70) return { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  return { bg: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
}

// ── Signal Row (expandable) ────────────────────────────────────────────

function SignalRow({ signal }: { signal: SignalDetail }) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = !signal.ok && (signal.howToFix || signal.affectedItems.length > 0);

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <button
        onClick={() => hasContent && setExpanded(!expanded)}
        className={[
          'flex items-center gap-3 w-full px-4 py-3 text-left transition-colors',
          hasContent ? 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer' : 'cursor-default',
        ].join(' ')}
      >
        {signal.ok ? (
          <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${signal.ok ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
            {signal.label}
          </p>
          {signal.detail && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{signal.detail}</p>
          )}
        </div>

        {signal.ok ? (
          <Badge variant="success">OK</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="warning">Fix</Badge>
            {hasContent && (
              expanded
                ? <ChevronDown className="h-4 w-4 text-zinc-400" />
                : <ChevronRight className="h-4 w-4 text-zinc-400" />
            )}
          </div>
        )}
      </button>

      {expanded && hasContent && (
        <div className="px-4 pb-4 pl-12">
          {signal.howToFix && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2 mb-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">How to fix</p>
              <p className="text-sm text-blue-900 dark:text-blue-200">{signal.howToFix}</p>
            </div>
          )}

          {signal.affectedItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Affected ({signal.affectedItems.length})</p>
              {signal.affectedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-md bg-zinc-50 dark:bg-zinc-800/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.label}</p>
                    {item.sublabel && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.sublabel}</p>
                    )}
                  </div>
                  {item.link && (
                    <Link
                      to={item.link as '/'}
                      className="text-primary-600 hover:text-primary-700 shrink-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export function GstReadinessPage() {
  const { data: readinessData, isLoading: readinessLoading } = useReadiness();
  const { data: detailsData, isLoading: detailsLoading } = useReadinessDetails();

  if (readinessLoading || detailsLoading) return <CardSkeleton />;

  const readiness = readinessData?.data;
  const signals = detailsData?.data ?? [];

  if (!readiness) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="GST Readiness" description="Configure GSTIN in Settings → Company to enable readiness tracking." />
      </div>
    );
  }

  const filedExternally = !!readiness.filedExternally;
  const filingStartLabel = readiness.filingStartLabel;
  const isPreparing = !!readiness.preparing;

  const color = scoreColor(readiness.score);
  const pending = signals.filter((s) => !s.ok);
  const done = signals.filter((s) => s.ok);
  const g1Days = daysUntil(readiness.dueDates.gstr1);
  const g3bDays = daysUntil(readiness.dueDates.gstr3b);
  const gstr1Filed = filedExternally || readiness.returns.gstr1.status === 'filed';
  const gstr3bFiled = filedExternally || readiness.returns.gstr3b.status === 'filed';

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="GST Readiness"
        breadcrumbs={[
          { label: 'GST', href: '/gst/returns' },
          { label: 'Readiness' },
        ]}
        description={filedExternally
          ? `${readiness.periodLabel} — filed externally. runq filing starts from ${filingStartLabel ?? 'next period'}.`
          : isPreparing
          ? `Preparing data for ${readiness.periodLabel} — fix issues now so filing is smooth next month.`
          : `Filing readiness for ${readiness.periodLabel}`}
      />

      {/* Score + due dates header */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className={`h-16 w-16 rounded-full ${color.bg} flex items-center justify-center text-white font-bold text-xl`}>
                {readiness.score >= 100 ? <CheckCircle className="h-8 w-8" /> : readiness.score}
              </div>
              <div>
                <p className={`text-2xl font-bold ${color.text}`}>{readiness.score}% Ready</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {pending.length === 0 ? 'All checks passed — ready to file' : `${pending.length} item${pending.length > 1 ? 's' : ''} need attention`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-lg border px-4 py-3 ${gstr1Filed ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : g1Days <= 3 && g1Days >= 0 ? 'border-red-200 bg-red-50 dark:bg-red-900/10' : g1Days < 0 ? 'border-red-300 bg-red-100 dark:bg-red-900/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-zinc-400" />
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">GSTR-1 Due</p>
              </div>
              <p className="text-lg font-semibold">
                {gstr1Filed ? (
                  <span className="text-green-600">{filedExternally ? 'Filed externally' : 'Filed'}</span>
                ) : g1Days < 0 ? (
                  <span className="text-red-600">{Math.abs(g1Days)} days overdue</span>
                ) : g1Days === 0 ? (
                  <span className="text-red-600">Due today</span>
                ) : (
                  <span>{g1Days} days left</span>
                )}
              </p>
              <p className="text-xs text-zinc-400">{readiness.dueDates.gstr1}</p>
            </div>
            <div className={`rounded-lg border px-4 py-3 ${gstr3bFiled ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : g3bDays <= 3 && g3bDays >= 0 ? 'border-red-200 bg-red-50 dark:bg-red-900/10' : g3bDays < 0 ? 'border-red-300 bg-red-100 dark:bg-red-900/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-zinc-400" />
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">GSTR-3B Due</p>
              </div>
              <p className="text-lg font-semibold">
                {gstr3bFiled ? (
                  <span className="text-green-600">{filedExternally ? 'Filed externally' : 'Filed'}</span>
                ) : g3bDays < 0 ? (
                  <span className="text-red-600">{Math.abs(g3bDays)} days overdue</span>
                ) : g3bDays === 0 ? (
                  <span className="text-red-600">Due today</span>
                ) : (
                  <span>{g3bDays} days left</span>
                )}
              </p>
              <p className="text-xs text-zinc-400">{readiness.dueDates.gstr3b}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* To Fix section */}
      {pending.length > 0 && (
        <Card className="mb-6">
          <CardHeader title={`To Fix (${pending.length})`} />
          <div>
            {pending.map((s) => (
              <SignalRow key={s.key} signal={s} />
            ))}
          </div>
        </Card>
      )}

      {/* All Good section */}
      {done.length > 0 && (
        <Card>
          <CardHeader title={`Passed (${done.length})`} />
          <div>
            {done.map((s) => (
              <SignalRow key={s.key} signal={s} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

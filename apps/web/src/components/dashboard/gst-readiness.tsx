import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, FileText, Calendar } from 'lucide-react';
import { Card, CardHeader, CardContent, Button } from '@/components/ui';
import { api } from '@/lib/api-client';

interface ReadinessSignal {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

interface ReadinessResult {
  period: string;
  periodLabel: string;
  score: number;
  signals: ReadinessSignal[];
  returns: {
    gstr1: { exists: boolean; status: string | null };
    gstr3b: { exists: boolean; status: string | null };
  };
  dueDates: {
    gstr1: string;
    gstr3b: string;
  };
  filedExternally?: boolean;
  filingStartLabel?: string;
  preparing?: boolean;
}

function useGstReadiness() {
  return useQuery({
    queryKey: ['gst', 'readiness'],
    queryFn: () => api.get<{ data: ReadinessResult }>('/gst/readiness'),
    staleTime: 120_000,
  });
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function scoreColor(score: number): { bg: string; text: string; ring: string } {
  if (score >= 90) return { bg: 'bg-green-500', text: 'text-green-600 dark:text-green-400', ring: 'ring-green-500' };
  if (score >= 70) return { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500' };
  return { bg: 'bg-red-500', text: 'text-red-600 dark:text-red-400', ring: 'ring-red-500' };
}

export function GstReadinessWidget() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useGstReadiness();

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="GST Readiness" />
        <CardContent className="py-6 text-center text-sm text-zinc-500">Loading...</CardContent>
      </Card>
    );
  }

  if (isError || !data?.data) {
    return (
      <Card>
        <CardHeader title="GST Readiness" />
        <CardContent className="py-6 text-center text-sm text-zinc-500">
          Unable to compute readiness. Configure GSTIN in Settings → Company.
        </CardContent>
      </Card>
    );
  }

  const r = data.data;
  const filedExternally = !!r.filedExternally;
  const isPreparing = !!r.preparing;
  const color = scoreColor(r.score);
  const g1Days = daysUntil(r.dueDates.gstr1);
  const g3bDays = daysUntil(r.dueDates.gstr3b);
  const pendingSignals = r.signals.filter((s) => !s.ok);
  const gstr1Filed = filedExternally || r.returns.gstr1.status === 'filed';
  const gstr3bFiled = filedExternally || r.returns.gstr3b.status === 'filed';

  return (
    <Card>
      <CardHeader
        title="GST Readiness"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/gst/readiness' as '/' })}>
            View →
          </Button>
        }
      />
      <CardContent>
        {/* Score + period header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {filedExternally ? `${r.periodLabel} — filed externally` : isPreparing ? `Preparing ${r.periodLabel}` : `For ${r.periodLabel}`}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-3xl font-bold ${color.text}`}>{r.score}%</span>
              <span className="text-sm text-zinc-500">ready</span>
            </div>
          </div>
          <div className={`h-12 w-12 rounded-full ${color.bg} flex items-center justify-center text-white font-bold text-sm`}>
            {r.score >= 90 ? <CheckCircle className="h-6 w-6" /> : <span>{r.score}</span>}
          </div>
        </div>

        {/* Due dates */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className={`rounded-md border px-3 py-2 ${gstr1Filed ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : g1Days <= 3 ? 'border-red-200 bg-red-50 dark:bg-red-900/10' : 'border-zinc-200 dark:border-zinc-700'}`}>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">GSTR-1</p>
            <p className="text-sm font-medium">
              {gstr1Filed ? (filedExternally ? '✓ External' : '✓ Filed') : isPreparing ? `${g1Days}d left` : g1Days < 0 ? `${Math.abs(g1Days)}d overdue` : g1Days === 0 ? 'Due today' : `${g1Days}d left`}
            </p>
          </div>
          <div className={`rounded-md border px-3 py-2 ${gstr3bFiled ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : g3bDays <= 3 ? 'border-red-200 bg-red-50 dark:bg-red-900/10' : 'border-zinc-200 dark:border-zinc-700'}`}>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">GSTR-3B</p>
            <p className="text-sm font-medium">
              {gstr3bFiled ? (filedExternally ? '✓ External' : '✓ Filed') : isPreparing ? `${g3bDays}d left` : g3bDays < 0 ? `${Math.abs(g3bDays)}d overdue` : g3bDays === 0 ? 'Due today' : `${g3bDays}d left`}
            </p>
          </div>
        </div>

        {/* Pending signals (top 3) */}
        {pendingSignals.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">To fix</p>
            {pendingSignals.slice(0, 3).map((s) => (
              <div key={s.key} className="flex items-start gap-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-800 dark:text-zinc-200">{s.label}</p>
                  {s.detail && <p className="text-zinc-500 dark:text-zinc-400">{s.detail}</p>}
                </div>
              </div>
            ))}
            {pendingSignals.length > 3 && (
              <p className="text-xs text-zinc-500 pt-1">
                + {pendingSignals.length - 3} more — <button onClick={() => navigate({ to: '/gst/readiness' as '/' })} className="text-primary-600 hover:underline">view all</button>
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <span>Ready to file</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { Download, RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import {
  usePull2b, useReconcile2b, use2bMatches, use2bSummary,
} from '@/hooks/queries/use-gst-returns';
import type { Gstr2bMatch, ReconSummary } from '@/hooks/queries/use-gst-returns';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Button, Card, CardHeader, CardContent, Badge, Combobox, StatsCard,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, useToast,
} from '@/components/ui';

function periodLabel(period: string): string {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${year}`;
}

function generatePeriodOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    options.push({ value: `${mm}${yyyy}`, label: periodLabel(`${mm}${yyyy}`) });
  }
  return options;
}

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  matched: { variant: 'success', label: 'Matched' },
  mismatched: { variant: 'warning', label: 'Mismatched' },
  not_in_books: { variant: 'danger', label: 'Not in Books' },
  not_in_2b: { variant: 'info', label: 'Not in 2B' },
};

export function ReconciliationPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const periodOptions = generatePeriodOptions();

  const pullMutation = usePull2b();
  const reconMutation = useReconcile2b();
  const { data: summaryData } = use2bSummary(period);
  const { data: matchesData, isLoading: matchesLoading } = use2bMatches(period, statusFilter);

  const summary: ReconSummary | null = summaryData?.data ?? null;
  const matches: Gstr2bMatch[] = matchesData?.data ?? [];

  function handlePull() {
    if (!period) { toast('Select a period', 'error'); return; }
    pullMutation.mutate(period, {
      onSuccess: () => toast('GSTR-2B pulled from GSTN', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Failed to pull 2B. Authenticate first.', 'error'),
    });
  }

  function handleReconcile() {
    if (!period) { toast('Select a period', 'error'); return; }
    reconMutation.mutate(period, {
      onSuccess: () => toast('Reconciliation complete', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  const statusOptions = [
    { value: '', label: 'All' },
    { value: 'matched', label: 'Matched' },
    { value: 'mismatched', label: 'Mismatched' },
    { value: 'not_in_books', label: 'Not in Books' },
    { value: 'not_in_2b', label: 'Not in 2B' },
  ];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="GSTR-2B Reconciliation"
        description="Match your purchase invoices against supplier-reported data in GSTR-2B."
      />

      {/* Period selector + actions */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="w-48">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Period</label>
              <Combobox options={periodOptions} value={period} onChange={setPeriod} placeholder="Select month..." />
            </div>
            <Button onClick={handlePull} disabled={pullMutation.isPending || !period} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              {pullMutation.isPending ? 'Pulling...' : 'Pull 2B from GSTN'}
            </Button>
            <Button onClick={handleReconcile} disabled={reconMutation.isPending || !period}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {reconMutation.isPending ? 'Reconciling...' : 'Run Reconciliation'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatsCard
            title="Matched"
            value={summary.matched.count}
            icon={CheckCircle}
            onClick={() => setStatusFilter('matched')}
          />
          <StatsCard
            title="Mismatched"
            value={summary.mismatched.count}
            icon={AlertTriangle}
            onClick={() => setStatusFilter('mismatched')}
          />
          <StatsCard
            title="Not in Books"
            value={summary.notInBooks.count}
            icon={XCircle}
            onClick={() => setStatusFilter('not_in_books')}
          />
          <StatsCard
            title="Not in 2B"
            value={summary.notIn2b.count}
            icon={HelpCircle}
            onClick={() => setStatusFilter('not_in_2b')}
          />
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="py-3">
              <p className="text-sm text-zinc-500">Total ITC Available (2B)</p>
              <p className="text-xl font-bold">{formatINR(summary.totalItcAvailable)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="text-sm text-zinc-500">ITC Claimable (Matched)</p>
              <p className="text-xl font-bold text-green-600">{formatINR(summary.totalItcClaimable)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter */}
      {period && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-zinc-500">Filter:</span>
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value || undefined)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                (statusFilter ?? '') === opt.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Matches table */}
      {!period ? (
        <EmptyState icon={RefreshCw} title="Select a Period" description="Choose a month to view reconciliation results." />
      ) : matchesLoading ? (
        <TableSkeleton />
      ) : matches.length === 0 ? (
        <EmptyState icon={RefreshCw} title="No Matches" description="Pull GSTR-2B and run reconciliation to see results." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Status</Th>
                <Th>Supplier GSTIN</Th>
                <Th>Supplier</Th>
                <Th>Invoice (2B)</Th>
                <Th>Invoice (Books)</Th>
                <Th className="text-right">Taxable (2B)</Th>
                <Th className="text-right">Taxable (Books)</Th>
                <Th className="text-right">Diff</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((m) => {
                const badge = STATUS_BADGE[m.matchStatus];
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.supplierGstin}</TableCell>
                    <TableCell className="text-xs">{m.supplierName ?? '—'}</TableCell>
                    <TableCell className="text-xs">{m.invoiceNumber2b || '—'}</TableCell>
                    <TableCell className="text-xs">{m.invoiceNumberBooks ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatINR(Number(m.taxableValue2b))}</TableCell>
                    <TableCell className="text-right">{m.taxableValueBooks ? formatINR(Number(m.taxableValueBooks)) : '—'}</TableCell>
                    <TableCell className="text-right">
                      {m.valueDiff && Number(m.valueDiff) > 0 ? (
                        <span className="text-red-500">{formatINR(Number(m.valueDiff))}</span>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

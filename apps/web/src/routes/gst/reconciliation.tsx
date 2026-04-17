import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import {
  usePull2b, useReconcile2b, use2bMatches, use2bSummary,
  useRequestOtp, useVerifyOtp, useForceLogout,
} from '@/hooks/queries/use-gst-returns';
import { useCompanySettings } from '@/hooks/queries/use-settings';
import type { Gstr2bMatch, ReconSummary } from '@/hooks/queries/use-gst-returns';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Button, Card, CardHeader, CardContent, Badge, Combobox, StatsCard,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Modal, Input, useToast,
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

  // OTP auth state
  const { data: companyData } = useCompanySettings();
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [gstUsername, setGstUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [txn, setTxn] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);

  const requestOtpMutation = useRequestOtp();
  const verifyOtpMutation = useVerifyOtp();
  const forceLogoutMutation = useForceLogout();

  const pullMutation = usePull2b();
  const reconMutation = useReconcile2b();
  const { data: summaryData } = use2bSummary(period);
  const { data: matchesData, isLoading: matchesLoading } = use2bMatches(period, statusFilter);

  const summary: ReconSummary | null = summaryData?.data ?? null;
  const matches: Gstr2bMatch[] = matchesData?.data ?? [];
  const gstin = companyData?.data?.gstin ?? '';

  // Auto-populate GST username from company settings
  useEffect(() => {
    if (companyData?.data?.gstUsername && !gstUsername) {
      setGstUsername(companyData.data.gstUsername);
    }
  }, [companyData, gstUsername]);

  function handlePull() {
    if (!period) { toast('Select a period', 'error'); return; }
    pullMutation.mutate(period, {
      onSuccess: () => toast('GSTR-2B pulled from GSTN', 'success'),
      onError: (err: any) => {
        const msg = err?.message ?? '';
        if (msg.includes('session expired') || msg.includes('Authenticate')) {
          setShowOtpModal(true);
          toast('GST session expired — authenticate to continue', 'error');
        } else {
          toast(msg || 'Failed to pull 2B', 'error');
        }
      },
    });
  }

  function handleReconcile() {
    if (!period) { toast('Select a period', 'error'); return; }
    reconMutation.mutate(period, {
      onSuccess: () => toast('Reconciliation complete', 'success'),
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  function handleRequestOtp() {
    if (!gstUsername) { toast('Enter GST portal username', 'error'); return; }
    if (!gstin) { toast('GSTIN not configured in Settings → Company', 'error'); return; }
    setSessionError(null);
    requestOtpMutation.mutate(
      { gstin, username: gstUsername },
      {
        onSuccess: (res: any) => {
          if (!res.data.success || !res.data.txn) {
            const msg = res.data.message ?? 'Failed to request OTP from GST portal';
            setSessionError(msg);
            toast(msg, 'error');
            return;
          }
          setTxn(res.data.txn);
          toast('OTP sent to your registered mobile', 'success');
        },
        onError: (err: any) => toast(err?.message ?? 'Failed to request OTP', 'error'),
      },
    );
  }

  function handleVerifyOtp() {
    if (!otp) { toast('Enter the OTP', 'error'); return; }
    verifyOtpMutation.mutate(
      { gstin, username: gstUsername, otp, txn },
      {
        onSuccess: () => {
          setShowOtpModal(false);
          setOtp('');
          setTxn('');
          toast('Authenticated — you can now pull 2B data', 'success');
          // Auto-trigger pull after auth
          if (period) {
            pullMutation.mutate(period, {
              onSuccess: () => toast('GSTR-2B pulled from GSTN', 'success'),
              onError: (err: any) => toast(err?.message ?? 'Failed to pull 2B', 'error'),
            });
          }
        },
        onError: (err: any) => toast(err?.message ?? 'OTP verification failed', 'error'),
      },
    );
  }

  function handleForceLogout() {
    if (!gstUsername) { toast('Enter GST portal username first', 'error'); return; }
    forceLogoutMutation.mutate(
      { gstin, username: gstUsername },
      {
        onSuccess: (res: any) => {
          toast(res.data.success ? 'Session cleared. Try OTP again.' : `Logout: ${res.data.message}`, res.data.success ? 'success' : 'error');
          setSessionError(null);
          setTxn('');
        },
        onError: (err: any) => toast(err?.message ?? 'Force logout failed', 'error'),
      },
    );
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

      {/* OTP Auth Modal */}
      <Modal open={showOtpModal} title="Authenticate with GST Portal" onClose={() => setShowOtpModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">GSTIN</label>
            <Input value={gstin} disabled />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">GST Portal Username</label>
            <Input
              value={gstUsername}
              onChange={(e) => setGstUsername(e.target.value)}
              placeholder="Your GST portal username"
            />
          </div>
          {!txn ? (
            <>
              {requestOtpMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-md px-3 py-2">
                  <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span>Requesting OTP from GST portal... this may take a few seconds</span>
                </div>
              )}
              {sessionError && (
                <div className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-2 space-y-2">
                  <p><strong>GST Portal:</strong> {sessionError}</p>
                  {sessionError.toLowerCase().includes('session') && (
                    <Button
                      onClick={handleForceLogout}
                      disabled={forceLogoutMutation.isPending}
                      variant="outline"
                      className="w-full"
                    >
                      {forceLogoutMutation.isPending ? 'Clearing...' : 'Clear Stuck Session'}
                    </Button>
                  )}
                </div>
              )}
              <Button onClick={handleRequestOtp} disabled={requestOtpMutation.isPending} className="w-full">
                {requestOtpMutation.isPending ? 'Sending...' : 'Send OTP'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-3 py-2">
                <span>OTP sent to your registered mobile. Enter it below.</span>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">OTP</label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                />
              </div>
              {verifyOtpMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-md px-3 py-2">
                  <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying OTP with GSTN...</span>
                </div>
              )}
              <Button onClick={handleVerifyOtp} disabled={verifyOtpMutation.isPending} className="w-full">
                {verifyOtpMutation.isPending ? 'Verifying...' : 'Verify OTP'}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

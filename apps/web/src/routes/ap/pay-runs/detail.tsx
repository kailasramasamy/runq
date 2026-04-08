import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, XCircle, Download, Play, UserPlus, FileText } from 'lucide-react';
import { usePaymentRun, useApproveLines, useRejectLines, useExecuteRun } from '../../../hooks/queries/use-payment-runs';
import { useBankAccounts } from '../../../hooks/queries/use-bank-accounts';
import { useCreateVendor } from '../../../hooks/queries/use-vendors';
import type { PaymentRunStatus, PaymentRunLineStatus, PaymentRunLine } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Card,
  CardContent,
  Button,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  TableSkeleton,
  StatsCard,
  Input,
  useToast,
} from '@/components/ui';

// ─── Status helpers ──────────────────────────────────────────────────────────

type BadgeVariant = 'warning' | 'success' | 'danger' | 'outline' | 'default' | 'cyan' | 'info';

const RUN_STATUS_VARIANT: Record<PaymentRunStatus, BadgeVariant> = {
  pending_approval: 'warning',
  partially_approved: 'cyan',
  approved: 'success',
  rejected: 'danger',
  executed: 'info',
};

const RUN_STATUS_LABEL: Record<PaymentRunStatus, string> = {
  pending_approval: 'Pending Approval',
  partially_approved: 'Partially Approved',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
};

const LINE_STATUS_VARIANT: Record<PaymentRunLineStatus, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  paid: 'info',
  failed: 'danger',
};

// ─── Summary cards ────────────────────────────────────────────────────────────

interface SummaryProps {
  totalCount: number;
  totalAmount: number;
  approvedCount: number;
  approvedAmount: number;
}

function RunSummary({ totalCount, totalAmount, approvedCount, approvedAmount }: SummaryProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
      <StatsCard title="Total Count" value={totalCount} formatValue={(v) => String(v)} />
      <StatsCard title="Total Amount" value={totalAmount} />
      <StatsCard title="Approved Count" value={approvedCount} formatValue={(v) => String(v)} />
      <StatsCard title="Approved Amount" value={approvedAmount} />
    </div>
  );
}

// ─── Line row ─────────────────────────────────────────────────────────────────

interface LineRowProps {
  line: PaymentRunLine;
  checked: boolean;
  onToggle: (id: string) => void;
}

function LineRow({ line, checked, onToggle, onVendorCreated }: LineRowProps & { onVendorCreated: () => void }) {
  const isMatched = line.vendorId !== null;
  const isPending = line.status === 'pending';
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <>
      <TableRow className={!isMatched && isPending ? 'bg-amber-50 dark:bg-amber-900/10' : undefined}>
        <TableCell>
          {isPending ? (
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(line.id)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
            />
          ) : null}
        </TableCell>
        <TableCell className="font-medium">{line.vendorName}</TableCell>
        <TableCell>
          {isMatched ? (
            <CheckCircle2 size={16} className="text-emerald-500" aria-label="Matched" />
          ) : (
            <div className="flex items-center gap-2">
              <XCircle size={16} className="text-red-400" aria-label="Unmatched" />
              {isPending && !showCreateForm && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                >
                  <UserPlus size={12} /> Create
                </button>
              )}
            </div>
          )}
        </TableCell>
        <TableCell align="right" numeric>{formatINR(line.amount)}</TableCell>
        <TableCell className="font-mono text-xs">
          {line.purchaseInvoiceId ? (
            <Link
              to="/ap/bills/$billId"
              params={{ billId: line.purchaseInvoiceId }}
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <FileText size={11} /> {line.reference ?? 'Bill'}
            </Link>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">{line.reference ?? '—'}</span>
          )}
        </TableCell>
        <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">{line.reason ?? '—'}</TableCell>
        <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">{line.dueDate ?? '—'}</TableCell>
        <TableCell>
          <Badge variant={LINE_STATUS_VARIANT[line.status]} className="capitalize">
            {line.status}
          </Badge>
        </TableCell>
      </TableRow>
      {showCreateForm && (
        <tr>
          <td colSpan={8}>
            <QuickVendorForm
              vendorName={line.vendorName}
              onCreated={() => { setShowCreateForm(false); onVendorCreated(); }}
              onCancel={() => setShowCreateForm(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Quick Vendor Creation Form (inline) ─────────────────────────────────────

function QuickVendorForm({ vendorName, onCreated, onCancel }: { vendorName: string; onCreated: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const createVendor = useCreateVendor();
  const [name, setName] = useState(vendorName);
  const [phone, setPhone] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createVendor.mutate(
      { name, phone: phone || undefined, bankAccountNumber: bankAccount || undefined, bankIfsc: ifsc || undefined, bankName: bankName || undefined, paymentTermsDays: 15 },
      {
        onSuccess: () => { toast(`Vendor "${name}" created. Re-submit the run to re-match.`, 'success'); onCreated(); },
        onError: () => toast('Failed to create vendor', 'error'),
      },
    );
  }

  return (
    <div className="border-l-4 border-indigo-500 bg-zinc-50 p-4 dark:bg-zinc-800/50">
      <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <UserPlus size={14} className="mr-1 inline" />
        Quick Vendor Creation — {vendorName}
      </p>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:gap-3">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
        <Input label="Bank A/C No" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
        <Input label="IFSC" value={ifsc} onChange={(e) => setIfsc(e.target.value)} placeholder="SBIN0001234" />
        <Input label="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="SBI" />
      </form>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={handleSubmit} loading={createVendor.isPending}>Create Vendor</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Action bar ───────────────────────────────────────────────────────────────

interface ActionBarProps {
  runId: string;
  runStatus: PaymentRunStatus;
  selected: string[];
  lines: PaymentRunLine[];
  onClearSelection: () => void;
}

function ActionBar({ runId, runStatus, selected, lines, onClearSelection }: ActionBarProps) {
  const { toast } = useToast();
  const [bankAccountId, setBankAccountId] = useState('');
  const { data: bankData } = useBankAccounts();
  const approve = useApproveLines();
  const reject = useRejectLines();
  const execute = useExecuteRun();

  const bankOptions = [
    { value: '', label: 'Select bank account…' },
    ...(bankData?.data ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const pendingLines = lines.filter((i) => i.status === 'pending');
  const allPendingIds = pendingLines.map((i) => i.id);
  const hasApproved = lines.some((i) => i.status === 'approved');
  const canExecute = (runStatus === 'approved' || runStatus === 'partially_approved') && hasApproved;
  const isExecuted = runStatus === 'executed';

  function handleApprove(ids: string[]) {
    if (ids.length === 0) { toast('No lines selected', 'error'); return; }
    approve.mutate(
      { runId, data: { lineIds: ids } },
      {
        onSuccess: () => { toast(`Approved ${ids.length} line(s)`, 'success'); onClearSelection(); },
        onError: () => toast('Approve failed', 'error'),
      },
    );
  }

  function handleReject(ids: string[]) {
    if (ids.length === 0) { toast('No lines selected', 'error'); return; }
    reject.mutate(
      { runId, data: { lineIds: ids } },
      {
        onSuccess: () => { toast(`Rejected ${ids.length} line(s)`, 'success'); onClearSelection(); },
        onError: () => toast('Reject failed', 'error'),
      },
    );
  }

  function handleExecute() {
    if (!bankAccountId) { toast('Select a bank account first', 'error'); return; }
    execute.mutate(
      { runId, bankAccountId },
      {
        onSuccess: (res) => {
          const d = (res as any).data;
          toast(`Executed: ${d.paid} paid, ${d.failed} failed. Total: ${formatINR(d.totalPaid)}`, 'success');
        },
        onError: () => toast('Execution failed', 'error'),
      },
    );
  }

  function handleExportCSV() {
    window.open(`/api/v1/ap/payment-runs/${runId}/export-csv`, '_blank');
  }

  if (isExecuted) return null;

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        {selected.length > 0 && (
          <>
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {selected.length} selected
            </span>
            <Button
              variant="outline"
              onClick={() => handleApprove(selected)}
              loading={approve.isPending}
            >
              <CheckCircle2 size={15} /> Approve Selected
            </Button>
            <Button
              variant="outline"
              onClick={() => handleReject(selected)}
              loading={reject.isPending}
              className="text-red-600 hover:text-red-700 dark:text-red-400"
            >
              <XCircle size={15} /> Reject Selected
            </Button>
          </>
        )}

        {allPendingIds.length > 0 && (
          <Button
            variant="outline"
            onClick={() => handleApprove(allPendingIds)}
            loading={approve.isPending}
          >
            Approve All ({allPendingIds.length})
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {canExecute && (
            <>
              <div className="w-56">
                <Select
                  label=""
                  options={bankOptions}
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                />
              </div>
              <Button onClick={handleExecute} loading={execute.isPending} disabled={!bankAccountId}>
                <Play size={15} /> Execute Payments
              </Button>
            </>
          )}
          {hasApproved && (
            <Button variant="outline" onClick={handleExportCSV}>
              <Download size={15} /> Export Bank CSV
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PayRunDetailPage({ runId }: { runId: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const { data, isLoading } = usePaymentRun(runId);
  const run = data?.data;

  function toggleOne(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => prev.length === ids.length ? [] : ids);
  }

  const pendingIds = (run?.lines ?? []).filter((i) => i.status === 'pending').map((i) => i.id);

  return (
    <div>
      <PageHeader
        title={run?.runId ?? 'Loading…'}
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Pay Runs', href: '/ap/pay-runs' },
          { label: run?.runId ?? '…' },
        ]}
        actions={
          run && (
            <Badge variant={RUN_STATUS_VARIANT[run.status]}>
              {RUN_STATUS_LABEL[run.status]}
            </Badge>
          )
        }
      />

      {run && (
        <RunSummary
          totalCount={run.totalCount}
          totalAmount={run.totalAmount}
          approvedCount={run.approvedCount}
          approvedAmount={run.approvedAmount}
        />
      )}

      {run?.source === 'bills' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
          <FileText size={14} />
          <span>
            Created from {run.totalCount} approved bill{run.totalCount === 1 ? '' : 's'}.
            Executing this run will settle each linked bill automatically.
          </span>
        </div>
      )}

      {run && (
        <ActionBar
          runId={runId}
          runStatus={run.status}
          selected={selected}
          lines={run.lines}
          onClearSelection={() => setSelected([])}
        />
      )}

      {/* Mobile line cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900 animate-pulse h-20" />
        ) : (run?.lines ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No lines found</p>
        ) : (
          (run?.lines ?? []).map((line) => {
            const isMatched = line.vendorId !== null;
            const isPending = line.status === 'pending';
            return (
              <div key={line.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isPending && (
                      <input
                        type="checkbox"
                        checked={selected.includes(line.id)}
                        onChange={() => toggleOne(line.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
                      />
                    )}
                    <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{line.vendorName}</span>
                  </div>
                  <Badge variant={LINE_STATUS_VARIANT[line.status]} className="capitalize">
                    {line.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {isMatched ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={12} /> Matched
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500">
                      <XCircle size={12} /> Unmatched
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-base font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatINR(line.amount)}
                </p>
                {line.reference && (
                  <p className="mt-1 font-mono text-xs text-zinc-400">{line.reference}</p>
                )}
                {line.reason && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{line.reason}</p>
                )}
                {line.dueDate && (
                  <p className="mt-1 text-xs text-zinc-400">Due: {line.dueDate}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <tr>
              <Th>
                {pendingIds.length > 0 ? (
                  <input
                    type="checkbox"
                    checked={selected.length === pendingIds.length && pendingIds.length > 0}
                    onChange={() => toggleAll(pendingIds)}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
                  />
                ) : null}
              </Th>
              <Th>Vendor Name</Th>
              <Th>Match</Th>
              <Th align="right">Amount</Th>
              <Th>Reference</Th>
              <Th>Reason</Th>
              <Th>Due Date</Th>
              <Th>Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={8} />
            ) : (run?.lines ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-zinc-500">No lines found</td>
              </tr>
            ) : (
              (run?.lines ?? []).map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  checked={selected.includes(line.id)}
                  onToggle={toggleOne}
                  onVendorCreated={() => {/* run will be refetched on next query invalidation */}}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {run?.source && (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-600">
          Source: <span className="font-mono">{run.source}</span>
          {run.description && <> — {run.description}</>}
        </p>
      )}
    </div>
  );
}

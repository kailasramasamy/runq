import { useState } from 'react';
import { CheckCircle2, XCircle, Download, Play } from 'lucide-react';
import { usePaymentBatch, useApproveInstructions, useRejectInstructions, useExecuteBatch } from '../../../hooks/queries/use-payment-queue';
import { useBankAccounts } from '../../../hooks/queries/use-bank-accounts';
import type { PaymentBatchStatus, InstructionStatus, PaymentInstruction } from '@runq/types';
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
  useToast,
} from '@/components/ui';

// ─── Status helpers ──────────────────────────────────────────────────────────

type BadgeVariant = 'warning' | 'success' | 'danger' | 'outline' | 'default' | 'cyan' | 'info';

const BATCH_STATUS_VARIANT: Record<PaymentBatchStatus, BadgeVariant> = {
  pending_approval: 'warning',
  partially_approved: 'cyan',
  approved: 'success',
  rejected: 'danger',
  executed: 'info',
};

const BATCH_STATUS_LABEL: Record<PaymentBatchStatus, string> = {
  pending_approval: 'Pending Approval',
  partially_approved: 'Partially Approved',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
};

const INSTRUCTION_STATUS_VARIANT: Record<InstructionStatus, BadgeVariant> = {
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

function BatchSummary({ totalCount, totalAmount, approvedCount, approvedAmount }: SummaryProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatsCard title="Total Count" value={totalCount} formatValue={(v) => String(v)} />
      <StatsCard title="Total Amount" value={totalAmount} />
      <StatsCard title="Approved Count" value={approvedCount} formatValue={(v) => String(v)} />
      <StatsCard title="Approved Amount" value={approvedAmount} />
    </div>
  );
}

// ─── Instruction row ──────────────────────────────────────────────────────────

interface InstructionRowProps {
  instruction: PaymentInstruction;
  checked: boolean;
  onToggle: (id: string) => void;
}

function InstructionRow({ instruction: ins, checked, onToggle }: InstructionRowProps) {
  const isMatched = ins.vendorId !== null;
  const isPending = ins.status === 'pending';

  return (
    <TableRow className={!isMatched && isPending ? 'bg-amber-50 dark:bg-amber-900/10' : undefined}>
      <TableCell>
        {isPending ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(ins.id)}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
          />
        ) : null}
      </TableCell>
      <TableCell className="font-medium">{ins.vendorName}</TableCell>
      <TableCell>
        {isMatched ? (
          <CheckCircle2 size={16} className="text-emerald-500" aria-label="Matched" />
        ) : (
          <XCircle size={16} className="text-red-400" aria-label="Unmatched" />
        )}
      </TableCell>
      <TableCell align="right" numeric>{formatINR(ins.amount)}</TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{ins.reference ?? '—'}</TableCell>
      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">{ins.reason ?? '—'}</TableCell>
      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">{ins.dueDate ?? '—'}</TableCell>
      <TableCell>
        <Badge variant={INSTRUCTION_STATUS_VARIANT[ins.status]} className="capitalize">
          {ins.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

// ─── Action bar ───────────────────────────────────────────────────────────────

interface ActionBarProps {
  batchId: string;
  batchStatus: PaymentBatchStatus;
  selected: string[];
  instructions: PaymentInstruction[];
  onClearSelection: () => void;
}

function ActionBar({ batchId, batchStatus, selected, instructions, onClearSelection }: ActionBarProps) {
  const { toast } = useToast();
  const [bankAccountId, setBankAccountId] = useState('');
  const { data: bankData } = useBankAccounts();
  const approve = useApproveInstructions();
  const reject = useRejectInstructions();
  const execute = useExecuteBatch();

  const bankOptions = [
    { value: '', label: 'Select bank account…' },
    ...(bankData?.data ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const pendingInstructions = instructions.filter((i) => i.status === 'pending');
  const allPendingIds = pendingInstructions.map((i) => i.id);
  const hasApproved = instructions.some((i) => i.status === 'approved');
  const canExecute = (batchStatus === 'approved' || batchStatus === 'partially_approved') && hasApproved;
  const isExecuted = batchStatus === 'executed';

  function handleApprove(ids: string[]) {
    if (ids.length === 0) { toast('No instructions selected', 'error'); return; }
    approve.mutate(
      { batchId, data: { instructionIds: ids } },
      {
        onSuccess: () => { toast(`Approved ${ids.length} instruction(s)`, 'success'); onClearSelection(); },
        onError: () => toast('Approve failed', 'error'),
      },
    );
  }

  function handleReject(ids: string[]) {
    if (ids.length === 0) { toast('No instructions selected', 'error'); return; }
    reject.mutate(
      { batchId, data: { instructionIds: ids } },
      {
        onSuccess: () => { toast(`Rejected ${ids.length} instruction(s)`, 'success'); onClearSelection(); },
        onError: () => toast('Reject failed', 'error'),
      },
    );
  }

  function handleExecute() {
    if (!bankAccountId) { toast('Select a bank account first', 'error'); return; }
    execute.mutate(
      { batchId, bankAccountId },
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
    window.open(`/api/v1/ap/payment-queue/${batchId}/export-csv`, '_blank');
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

export function PaymentQueueDetailPage({ batchId }: { batchId: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const { data, isLoading } = usePaymentBatch(batchId);
  const batch = data?.data;

  function toggleOne(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => prev.length === ids.length ? [] : ids);
  }

  const pendingIds = (batch?.instructions ?? []).filter((i) => i.status === 'pending').map((i) => i.id);

  return (
    <div>
      <PageHeader
        title={batch?.batchId ?? 'Loading…'}
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Payment Queue', href: '/ap/queue' },
          { label: batch?.batchId ?? '…' },
        ]}
        actions={
          batch && (
            <Badge variant={BATCH_STATUS_VARIANT[batch.status]}>
              {BATCH_STATUS_LABEL[batch.status]}
            </Badge>
          )
        }
      />

      {batch && (
        <BatchSummary
          totalCount={batch.totalCount}
          totalAmount={batch.totalAmount}
          approvedCount={batch.approvedCount}
          approvedAmount={batch.approvedAmount}
        />
      )}

      {batch && (
        <ActionBar
          batchId={batchId}
          batchStatus={batch.status}
          selected={selected}
          instructions={batch.instructions}
          onClearSelection={() => setSelected([])}
        />
      )}

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
          ) : (batch?.instructions ?? []).length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-sm text-zinc-500">No instructions found</td>
            </tr>
          ) : (
            (batch?.instructions ?? []).map((ins) => (
              <InstructionRow
                key={ins.id}
                instruction={ins}
                checked={selected.includes(ins.id)}
                onToggle={toggleOne}
              />
            ))
          )}
        </TableBody>
      </Table>

      {batch?.source && (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-600">
          Source: <span className="font-mono">{batch.source}</span>
          {batch.description && <> — {batch.description}</>}
        </p>
      )}
    </div>
  );
}

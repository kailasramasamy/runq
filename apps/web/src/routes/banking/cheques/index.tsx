import { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import {
  useCheques,
  useCreateCheque,
  useDepositCheque,
  useClearCheque,
  useBounceCheque,
  useCancelCheque,
} from '@/hooks/queries/use-cheques';
import { useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Cheque, ChequeStatus } from '@runq/types';
import type { CreateChequeInput } from '@runq/validators';
import {
  PageHeader,
  Badge,
  Button,
  EmptyState,
  CardSkeleton,
  Table,
  TableHeader,
  Th,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui';
import { ChequeForm } from '@/components/forms/cheque-form';

const STATUS_TABS: { label: string; value: ChequeStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Deposited', value: 'deposited' },
  { label: 'Cleared', value: 'cleared' },
  { label: 'Bounced', value: 'bounced' },
];

const STATUS_VARIANT: Record<ChequeStatus, 'default' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  deposited: 'default',
  cleared: 'success',
  bounced: 'danger',
  cancelled: 'default',
};

function ChequeActions({ cheque }: { cheque: Cheque }) {
  const { toast } = useToast();
  const depositMutation = useDepositCheque();
  const clearMutation = useClearCheque();
  const bounceMutation = useBounceCheque();
  const cancelMutation = useCancelCheque();
  const [showDepositDate, setShowDepositDate] = useState(false);
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));

  function handleDeposit() {
    depositMutation.mutate(
      { id: cheque.id, data: { depositDate } },
      {
        onSuccess: () => { toast('Cheque deposited.', 'success'); setShowDepositDate(false); },
        onError: () => toast('Failed to deposit.', 'error'),
      },
    );
  }

  function handleClear() {
    clearMutation.mutate(cheque.id, {
      onSuccess: () => toast('Cheque cleared.', 'success'),
      onError: () => toast('Failed to clear.', 'error'),
    });
  }

  function handleBounce() {
    const reason = window.prompt('Bounce reason:');
    if (!reason) return;
    bounceMutation.mutate(
      { id: cheque.id, data: { reason } },
      {
        onSuccess: () => toast('Cheque marked as bounced.', 'success'),
        onError: () => toast('Failed to bounce.', 'error'),
      },
    );
  }

  function handleCancel() {
    cancelMutation.mutate(cheque.id, {
      onSuccess: () => toast('Cheque cancelled.', 'success'),
      onError: () => toast('Failed to cancel.', 'error'),
    });
  }

  return (
    <div className="flex items-center gap-1">
      {cheque.status === 'pending' && (
        <>
          {cheque.type === 'received' && (
            showDepositDate ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:[color-scheme:dark]"
                />
                <Button size="sm" variant="ghost" onClick={handleDeposit} loading={depositMutation.isPending}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDepositDate(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setShowDepositDate(true)}>Deposit</Button>
            )
          )}
          <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
        </>
      )}
      {cheque.status === 'deposited' && (
        <>
          <Button size="sm" variant="ghost" onClick={handleClear}>Clear</Button>
          <Button size="sm" variant="ghost" onClick={handleBounce}>Bounce</Button>
        </>
      )}
    </div>
  );
}

function ChequeRow({ cheque }: { cheque: Cheque }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{cheque.chequeNumber}</TableCell>
      <TableCell>
        <Badge variant={cheque.type === 'received' ? 'success' : 'warning'}>
          {cheque.type}
        </Badge>
      </TableCell>
      <TableCell>{cheque.partyName ?? cheque.partyId.slice(0, 8)}</TableCell>
      <TableCell align="right" numeric>
        <span className="font-mono font-medium tabular-nums">{formatINR(cheque.amount)}</span>
      </TableCell>
      <TableCell className="text-xs text-zinc-500">{cheque.chequeDate}</TableCell>
      <TableCell className="text-xs text-zinc-500">{cheque.depositDate ?? '—'}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[cheque.status]}>{cheque.status}</Badge>
      </TableCell>
      <TableCell><ChequeActions cheque={cheque} /></TableCell>
    </TableRow>
  );
}

export function ChequesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ChequeStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  const filters: Record<string, string> = {};
  if (activeTab !== 'all') filters.status = activeTab;

  const { data, isLoading } = useCheques(filters);
  const createMutation = useCreateCheque();
  const chequesList = data?.data ?? [];

  function handleCreate(input: CreateChequeInput) {
    createMutation.mutate(input, {
      onSuccess: () => {
        toast('Cheque created.', 'success');
        setShowForm(false);
      },
      onError: () => toast('Failed to create cheque.', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Banking', href: '/banking' }, { label: 'Cheques' }]}
        title="Cheque & PDC Management"
        description="Track received and issued cheques, manage post-dated cheques."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> New Cheque
          </Button>
        }
      />

      {showForm && (
        <div className="mb-6">
          <ChequeForm
            onSubmit={handleCreate}
            isLoading={createMutation.isPending}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Status Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : chequesList.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No cheques found"
          description="Create a cheque to start tracking payments."
          action={
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus size={14} /> New Cheque
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <tr>
                <Th>Cheque #</Th>
                <Th>Type</Th>
                <Th>Party</Th>
                <Th align="right">Amount</Th>
                <Th>Cheque Date</Th>
                <Th>Deposit Date</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {chequesList.map((cheque) => (
                <ChequeRow key={cheque.id} cheque={cheque} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

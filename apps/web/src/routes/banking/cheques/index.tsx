import { useState } from 'react';
import { Plus, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
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
import type { Cheque, ChequeStatus } from '@runq/types';
import type { CreateChequeInput } from '@runq/validators';
import {
  Badge,
  Button,
  CardSkeleton,
} from '@/components/ui';
import {
  PageHeader, Button as ArButton, StatTile, Tabs,
  Table, TableHeader, Th, TableBody, TableRow, TableCell, EmptyState,
  formatDate,
} from '@/components/ar/primitives';
import { formatINRShort } from '@/lib/utils';
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

const CARD_BASE = 'cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800';

function ChequeCard({ cheque }: { cheque: Cheque }) {
  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
            #{cheque.chequeNumber}
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {cheque.partyName ?? cheque.partyId.slice(0, 8)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatINR(cheque.amount)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{cheque.chequeDate}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[cheque.status]}>{cheque.status}</Badge>
        <Badge variant={cheque.type === 'received' ? 'success' : 'warning'}>{cheque.type}</Badge>
        {cheque.depositDate && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Dep: {cheque.depositDate}</span>
        )}
      </div>
    </div>
  );
}

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

  // KPI calculations
  const totalAmount = chequesList.reduce((a, c) => a + Number(c.amount), 0);
  const pendingCount = chequesList.filter((c) => c.status === 'pending').length;
  const depositedCount = chequesList.filter((c) => c.status === 'deposited').length;
  const bouncedCount = chequesList.filter((c) => c.status === 'bounced').length;

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'Banking', href: '/banking/accounts' }, { label: 'Cheques' }]}
        title="Cheques & PDCs"
        description="Track received and issued cheques, manage post-dated cheques."
        actions={
          <>
            <ArButton
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() => downloadCSV('cheques.csv', ['Cheque #', 'Date', 'Party', 'Amount', 'Type', 'Status'], chequesList.map(c => [c.chequeNumber, c.chequeDate, c.partyName ?? c.partyId, c.amount, c.type, c.status]))}
            >
              Export
            </ArButton>
            <ArButton size="sm" icon={<Plus size={13} />} onClick={() => setShowForm((v) => !v)}>
              New cheque
            </ArButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total amount (in view)" value={formatINRShort(totalAmount)} sub={`${chequesList.length} cheques`} />
        <StatTile label="Pending" value={pendingCount} sub="Awaiting deposit" tone={pendingCount > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Deposited" value={depositedCount} sub="In bank pipeline" />
        <StatTile label="Bounced" value={bouncedCount} sub="Need follow-up" tone={bouncedCount > 0 ? 'neg' : 'neutral'} />
      </div>

      {showForm && (
        <div className="mb-5">
          <ChequeForm
            onSubmit={handleCreate}
            isLoading={createMutation.isPending}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <Tabs<ChequeStatus | 'all'>
        active={activeTab}
        onChange={setActiveTab}
        tabs={STATUS_TABS.map((t) => ({ id: t.value, label: t.label }))}
      />

      {isLoading ? (
        <>
          <div className="space-y-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))}
          </div>
          <div className="hidden md:block">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
        </>
      ) : chequesList.length === 0 ? (
        <EmptyState
          icon={<Plus size={18} />}
          title="No cheques found"
          description="Create a cheque to start tracking payments."
          action={
            <ArButton size="sm" icon={<Plus size={13} />} onClick={() => setShowForm(true)}>
              New cheque
            </ArButton>
          }
        />
      ) : (
        <>
          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            {chequesList.map((cheque) => <ChequeCard key={cheque.id} cheque={cheque} />)}
          </div>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
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
        </>
      )}
    </div>
  );
}

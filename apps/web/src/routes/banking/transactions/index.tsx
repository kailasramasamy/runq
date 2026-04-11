import { useState, useEffect, memo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Sparkles, RefreshCw, Calendar } from 'lucide-react';
import { useBankAccounts, useBankBalance } from '@/hooks/queries/use-bank-accounts';
import { useBankTransactions, useCategorizeTransactions, useSyncTransactions } from '@/hooks/queries/use-transactions';
import { formatINR } from '@/lib/utils';
import { CategoryBadge } from '@/components/banking/category-badge';
import type { BankTransaction, ReconStatus } from '@runq/types';
import {
  PageHeader,
  Badge,
  Button,
  Select,
  DateInput,
  Table,
  TableHeader,
  Th,
  TableBody,
  TableRow,
  TableCell,
  TableSkeleton,
  EmptyState,
  Pagination,
} from '@/components/ui';
import { ArrowUpDown } from 'lucide-react';

const LIMIT = 25;

const RECON_VARIANT: Record<ReconStatus, 'default' | 'warning' | 'success' | 'info'> = {
  unreconciled: 'warning',
  matched: 'success',
  manually_matched: 'info',
  excluded: 'default',
};

const RECON_LABELS: Record<ReconStatus, string> = {
  unreconciled: 'Unreconciled',
  matched: 'Matched',
  manually_matched: 'Manual Match',
  excluded: 'Excluded',
};

const CARD_BASE = 'cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800';

function TxnCard({ txn }: { txn: BankTransaction }) {
  const isCredit = txn.type === 'credit';
  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {txn.narration ?? '—'}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{txn.transactionDate}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-semibold tabular-nums ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {isCredit ? '+' : '-'}{formatINR(txn.amount)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            {isCredit ? 'Credit' : 'Debit'}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant={RECON_VARIANT[txn.reconStatus]}>
          {RECON_LABELS[txn.reconStatus]}
        </Badge>
        {txn.glAccountName && (
          <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">{txn.glAccountName}</span>
        )}
      </div>
    </div>
  );
}

// FE-03: Virtual scrolling needed here — add @tanstack/react-virtual when list grows large.
const TxnRow = memo(function TxnRow({ txn }: { txn: BankTransaction }) {
  const isCredit = txn.type === 'credit';
  return (
    <TableRow>
      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
        {txn.transactionDate}
      </TableCell>
      <TableCell className="max-w-xs">
        <p className="truncate text-sm">{txn.narration ?? '—'}</p>
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {txn.reference ?? '—'}
      </TableCell>
      <TableCell align="right" numeric>
        {!isCredit ? (
          <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
            {formatINR(txn.amount)}
          </span>
        ) : (
          <span className="text-zinc-300 dark:text-zinc-700">—</span>
        )}
      </TableCell>
      <TableCell align="right" numeric>
        {isCredit ? (
          <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatINR(txn.amount)}
          </span>
        ) : (
          <span className="text-zinc-300 dark:text-zinc-700">—</span>
        )}
      </TableCell>
      <TableCell align="right" numeric>
        <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
          {txn.runningBalance !== null ? formatINR(txn.runningBalance) : '—'}
        </span>
      </TableCell>
      <TableCell>
        <CategoryBadge
          transactionId={txn.id}
          accountName={txn.glAccountName}
          accountCode={txn.glAccountCode}
          confidence={txn.glConfidence}
        />
      </TableCell>
      <TableCell>
        <Badge variant={RECON_VARIANT[txn.reconStatus]}>
          {RECON_LABELS[txn.reconStatus]}
        </Badge>
      </TableCell>
    </TableRow>
  );
});

export function TransactionsPage() {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState('');
  const [reconStatus, setReconStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const categorize = useCategorizeTransactions();
  const sync = useSyncTransactions();

  const { data: accountsData } = useBankAccounts();
  const accounts = accountsData?.data ?? [];

  // Auto-select first account
  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const { data: balanceData } = useBankBalance(accountId);
  const lastSyncDate = balanceData?.data?.lastTransactionDate ?? null;

  const reconciled = reconStatus === 'matched' || reconStatus === 'manually_matched'
    ? true
    : reconStatus === 'unreconciled'
      ? false
      : undefined;

  const { data, isLoading } = useBankTransactions({
    accountId: accountId || '',
    type: (type as 'credit' | 'debit') || undefined,
    reconciled,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: LIMIT,
  });

  const transactions = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const accountOptions = [
    { value: '', label: 'All Accounts' },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'credit', label: 'Credit' },
    { value: 'debit', label: 'Debit' },
  ];

  const reconOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'unreconciled', label: 'Unreconciled' },
    { value: 'matched', label: 'Matched' },
    { value: 'manually_matched', label: 'Manual Match' },
    { value: 'excluded', label: 'Excluded' },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Banking', href: '/banking' }, { label: 'Transactions' }]}
        title="Transactions"
        description="Bank statement entries and reconciliation status."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => accountId && sync.mutate({ accountId })}
              disabled={!accountId || sync.isPending}
            >
              <RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} />
              {sync.isPending ? 'Syncing...' : 'Sync'}
            </Button>
            <Button
              variant="outline"
              onClick={() => accountId && categorize.mutate({ accountId })}
              disabled={!accountId || categorize.isPending}
            >
              <Sparkles size={16} />
              {categorize.isPending ? 'Categorizing...' : 'Auto-Categorize'}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/banking/transactions/import' })}
            >
              <Upload size={16} />
              Import Statement
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="col-span-2 sm:w-48">
          <Select
            label="Account"
            options={accountOptions}
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setPage(1); }}
          />
        </div>
        {lastSyncDate && (
          <div className="col-span-2 flex items-center gap-1.5 self-end pb-2 sm:col-span-1">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Synced till <span className="font-medium text-zinc-700 dark:text-zinc-300">{new Date(lastSyncDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </span>
          </div>
        )}
        <div className="sm:w-36">
          <Select
            label="Type"
            options={typeOptions}
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
          />
        </div>
        <div className="sm:w-44">
          <Select
            label="Recon Status"
            options={reconOptions}
            value={reconStatus}
            onChange={(e) => { setReconStatus(e.target.value); setPage(1); }}
          />
        </div>
        <div className="sm:w-40">
          <DateInput
            label="From"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="sm:w-40">
          <DateInput
            label="To"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={ArrowUpDown}
            title="No transactions found"
            description="Import a bank statement to view transactions here."
            action={
              <Button size="sm" onClick={() => navigate({ to: '/banking/transactions/import' })}>
                <Upload size={14} /> Import CSV
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {transactions.map((txn) => <TxnCard key={txn.id} txn={txn} />)}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <tr>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Reference</Th>
              <Th align="right">Debit</Th>
              <Th align="right">Credit</Th>
              <Th align="right">Balance</Th>
              <Th>Category</Th>
              <Th>Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon={ArrowUpDown}
                    title="No transactions found"
                    description="Import a bank statement to view transactions here."
                    action={
                      <Button
                        size="sm"
                        onClick={() => navigate({ to: '/banking/transactions/import' })}
                      >
                        <Upload size={14} /> Import CSV
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : (
              transactions.map((txn) => <TxnRow key={txn.id} txn={txn} />)
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

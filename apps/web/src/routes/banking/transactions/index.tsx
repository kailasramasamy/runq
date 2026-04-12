import { useState, useEffect, memo, Fragment } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Sparkles, RefreshCw, Calendar, Search } from 'lucide-react';
import { useBankAccounts, useBankBalance } from '@/hooks/queries/use-bank-accounts';
import { useBankTransactions, useCategorizeTransactions, useSyncTransactions } from '@/hooks/queries/use-transactions';
import { formatINR } from '@/lib/utils';
import { CategoryBadge } from '@/components/banking/category-badge';
import { VendorBadge } from '@/components/banking/vendor-badge';
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
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium text-zinc-900 dark:text-zinc-100 ${expanded ? '' : 'truncate'}`}
            onClick={() => setExpanded((v) => !v)}
          >
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
const TxnRow = memo(function TxnRow({ txn, onSelect }: { txn: BankTransaction; onSelect: (id: string) => void }) {
  const isCredit = txn.type === 'credit';
  return (
    <TableRow className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => onSelect(txn.id)}>
      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
        {txn.transactionDate}
      </TableCell>
      <TableCell className="max-w-xs">
        <p className="truncate text-sm">{txn.narration ?? '—'}</p>
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {txn.reference ?? '—'}
      </TableCell>
      <TableCell className="text-sm text-zinc-700 dark:text-zinc-300">
        {txn.vendorName ?? '—'}
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

function TxnDetail({ txn }: { txn: BankTransaction }) {
  const isCredit = txn.type === 'credit';
  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-zinc-50 dark:bg-zinc-900/50 border-y border-zinc-200 dark:border-zinc-800 px-6 py-4">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Description: </span>
              <span className="text-zinc-900 dark:text-zinc-100">{txn.narration ?? '—'}</span>
            </div>
            {txn.reference && (
              <div>
                <span className="text-zinc-500 dark:text-zinc-400">Reference: </span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">{txn.reference}</span>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div>
                <span className="text-zinc-500 dark:text-zinc-400">Amount: </span>
                <span className={`font-medium tabular-nums ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isCredit ? '+' : '-'}{formatINR(txn.amount)}
                </span>
              </div>
              {txn.glAccountName && (
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Category: </span>
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {txn.glAccountName}
                    <span className="text-zinc-400 dark:text-zinc-500 ml-1 text-xs">({txn.glAccountCode})</span>
                  </span>
                </div>
              )}
              <VendorBadge transactionId={txn.id} type={txn.type} reconStatus={txn.reconStatus} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function TransactionsPage() {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState('');
  const [reconStatus, setReconStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    search: search || undefined,
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

      {lastSyncDate && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 dark:border-zinc-700 dark:bg-zinc-800/50">
          <Calendar className="h-3 w-3 text-zinc-400" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Synced till <span className="font-medium text-zinc-700 dark:text-zinc-300">{new Date(lastSyncDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </span>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="col-span-2 sm:w-48">
          <Select
            label="Account"
            options={accountOptions}
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setPage(1); }}
          />
        </div>
        <div className="col-span-2 sm:w-52">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Narration or reference…"
              className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
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
              <Th>Vendor</Th>
              <Th align="right">Debit</Th>
              <Th align="right">Credit</Th>
              <Th align="right">Balance</Th>
              <Th>Category</Th>
              <Th>Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={8} cols={9} />
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={9}>
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
              transactions.map((txn) => (
                <Fragment key={txn.id}>
                  <TxnRow txn={txn} onSelect={(id) => setSelectedId((prev) => prev === id ? null : id)} />
                  {selectedId === txn.id && <TxnDetail txn={txn} />}
                </Fragment>
              ))
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

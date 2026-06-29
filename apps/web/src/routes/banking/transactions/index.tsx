import { useState, useEffect, memo, Fragment } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Sparkles, RefreshCw, Calendar, Search } from 'lucide-react';
import { useBankAccounts, useBankBalance } from '@/hooks/queries/use-bank-accounts';
import { useBankTransactions, useCategorizeTransactions, useSyncTransactions } from '@/hooks/queries/use-transactions';
import { formatINR } from '@/lib/utils';
import { CategoryBadge } from '@/components/banking/category-badge';
import { VendorBadge } from '@/components/banking/vendor-badge';
import { MemoField } from '@/components/banking/memo-field';
import { DocumentTrail } from '@/components/audit/document-trail';
import type { BankTransaction, ReconStatus } from '@runq/types';
import {
  Badge,
  DateInput,
  TableSkeleton,
} from '@/components/ui';
import {
  PageHeader, Button, Select, StatTile,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState, Pagination,
} from '@/components/ar/primitives';
import { formatINRShort } from '@/lib/utils';
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

/**
 * A credit txn with a customer assigned but still recon_status='unreconciled'
 * is in the "tagged but not allocated" state — the auto-receipt service tagged
 * the customer but couldn't allocate the payment to an invoice (usually because
 * no open invoice exists for that customer). Distinct from plain unreconciled.
 */
function reconBadge(txn: BankTransaction): { label: string; variant: 'default' | 'warning' | 'success' | 'info'; title?: string } {
  if (txn.reconStatus === 'unreconciled' && txn.type === 'credit' && txn.customerId) {
    return {
      label: 'Waiting on invoice',
      variant: 'warning',
      title: 'Customer payment recorded but no open invoice to allocate against — create or issue one.',
    };
  }
  return { label: RECON_LABELS[txn.reconStatus], variant: RECON_VARIANT[txn.reconStatus] };
}

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
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {(() => {
          const b = reconBadge(txn);
          return <Badge variant={b.variant} title={b.title}>{b.label}</Badge>;
        })()}
        {txn.glAccountName && (
          <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">{txn.glAccountName}</span>
        )}
        {(txn.vendorName || txn.customerName) && (
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">· {txn.vendorName ?? txn.customerName}</span>
        )}
      </div>
      {txn.runningBalance !== null && (
        <div className="mt-1 text-right text-[11px] text-zinc-400 dark:text-zinc-500">
          Bal: <span className="tabular-nums">{formatINR(txn.runningBalance)}</span>
        </div>
      )}
    </div>
  );
}

// FE-03: Virtual scrolling needed here — add @tanstack/react-virtual when list grows large.
const TxnRow = memo(function TxnRow({ txn, onSelect }: { txn: BankTransaction; onSelect: (id: string) => void }) {
  const isCredit = txn.type === 'credit';
  return (
    <TableRow className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => onSelect(txn.id)}>
      <TableCell className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
        {txn.transactionDate}
      </TableCell>
      <TableCell className="max-w-xs">
        <p className="truncate text-sm">{txn.narration ?? '—'}</p>
        {txn.memo && (
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={txn.memo}>{txn.memo}</p>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {txn.reference ?? '—'}
      </TableCell>
      <TableCell className="text-sm text-zinc-700 dark:text-zinc-300" onClick={(e) => e.stopPropagation()}>
        <VendorBadge
          transactionId={txn.id}
          type={txn.type}
          reconStatus={txn.reconStatus}
          assignedName={txn.vendorName ?? txn.customerName}
        />
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
        {(() => {
          const b = reconBadge(txn);
          return <Badge variant={b.variant} title={b.title}>{b.label}</Badge>;
        })()}
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
            <MemoField txn={txn} />
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
              <VendorBadge
                transactionId={txn.id}
                type={txn.type}
                reconStatus={txn.reconStatus}
                assignedName={txn.vendorName ?? txn.customerName}
              />
            </div>
            {/* Document trail */}
            <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
              <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Audit Trail</p>
              <DocumentTrail entityType="bank_transaction" entityId={txn.id} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function TransactionsPage() {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '');
  const [type, setType] = useState('');
  const [reconStatus, setReconStatus] = useState('');
  const [inSuspense, setInSuspense] = useState(false);
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

  const { data, isLoading } = useBankTransactions({
    accountId: accountId || '',
    type: (type as 'credit' | 'debit') || undefined,
    reconStatus: (reconStatus as 'unreconciled' | 'matched' | 'manually_matched' | 'excluded') || undefined,
    inSuspense: inSuspense || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    page,
    limit: LIMIT,
  });

  const transactions = data?.data ?? [];
  const meta = data?.meta;
  const totals = (data as { totals?: { debit: number; credit: number } })?.totals;
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
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'Banking', href: '/banking' }, { label: 'Transactions' }]}
        title="Transactions"
        description="Bank statement entries and reconciliation status."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={13} className={sync.isPending ? 'animate-spin' : ''} />}
              onClick={() => accountId && sync.mutate({ accountId })}
              disabled={!accountId || sync.isPending}
            >
              {sync.isPending ? 'Syncing…' : 'Sync'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Sparkles size={13} />}
              onClick={() => accountId && categorize.mutate({ accountId })}
              disabled={!accountId || categorize.isPending}
            >
              {categorize.isPending ? 'Categorising…' : 'Auto-categorise'}
            </Button>
            <Button size="sm" icon={<Upload size={13} />} onClick={() => navigate({ to: '/finance/banking/transactions/import' })}>
              Import statement
            </Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Transactions" value={total} sub={`Page ${page} of ${totalPages}`} />
        <StatTile
          label="Total debit"
          value={totals ? formatINRShort(totals.debit) : '—'}
          sub="In view"
          tone="neg"
        />
        <StatTile
          label="Total credit"
          value={totals ? formatINRShort(totals.credit) : '—'}
          sub="In view"
          tone="pos"
        />
        <StatTile
          label="Net change"
          value={totals ? formatINRShort(totals.credit - totals.debit) : '—'}
          sub="Credit − debit"
          tone={totals && totals.credit - totals.debit >= 0 ? 'pos' : 'neg'}
        />
      </div>

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
              className="h-8 w-full rounded-md border border-zinc-300 bg-white py-0 pl-8 pr-3 text-[12.5px] text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
        <div className="min-w-0">
          <Select
            options={typeOptions}
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
          />
        </div>
        <div className="min-w-0">
          <Select
            options={reconOptions}
            value={reconStatus}
            onChange={(e) => { setReconStatus(e.target.value); setPage(1); }}
          />
        </div>
        <div className="col-span-2 sm:col-span-1 sm:self-end">
          <button
            type="button"
            onClick={() => { setInSuspense((v) => !v); setPage(1); }}
            className={`inline-flex h-8 w-full items-center justify-center rounded-full border px-3 text-[12.5px] font-medium transition sm:w-auto ${
              inSuspense
                ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
            }`}
          >
            In suspense
          </button>
        </div>
        <div className="sm:w-40">
          <DateInput
            label="From"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 py-0 text-[12.5px]"
          />
        </div>
        <div className="sm:w-40">
          <DateInput
            label="To"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 py-0 text-[12.5px]"
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
            icon={<ArrowUpDown size={18} />}
            title="No transactions found"
            description="Import a bank statement to view transactions here."
            action={
              <Button size="sm" onClick={() => navigate({ to: '/finance/banking/transactions/import' })}>
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
              <Th>Vendor / Customer</Th>
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
                    icon={<ArrowUpDown size={18} />}

                    title="No transactions found"
                    description="Import a bank statement to view transactions here."
                    action={
                      <Button
                        size="sm"
                        onClick={() => navigate({ to: '/finance/banking/transactions/import' })}
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

      {totals && (total > 0) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm sm:justify-end sm:gap-6 dark:border-zinc-700 dark:bg-zinc-800/50">
          <span className="text-zinc-500 dark:text-zinc-400">{total} transactions</span>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Total Debit: </span>
            <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{formatINR(totals.debit)}</span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Total Credit: </span>
            <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(totals.credit)}</span>
          </div>
        </div>
      )}

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

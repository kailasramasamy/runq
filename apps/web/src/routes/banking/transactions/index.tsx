import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Sparkles } from 'lucide-react';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useBankTransactions, useCategorizeTransactions } from '@/hooks/queries/use-transactions';
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

function TxnRow({ txn }: { txn: BankTransaction }) {
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
}

export function TransactionsPage() {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState('');
  const [reconStatus, setReconStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const categorize = useCategorizeTransactions();

  const { data: accountsData } = useBankAccounts();
  const accounts = accountsData?.data ?? [];

  // Auto-select first account
  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

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
          <div className="flex gap-2">
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
              Import CSV
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select
            label="Account"
            options={accountOptions}
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-36">
          <Select
            label="Type"
            options={typeOptions}
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-44">
          <Select
            label="Recon Status"
            options={reconOptions}
            value={reconStatus}
            onChange={(e) => { setReconStatus(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-40">
          <DateInput
            label="From"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-40">
          <DateInput
            label="To"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
      </div>

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

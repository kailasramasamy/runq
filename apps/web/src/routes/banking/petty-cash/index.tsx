import { useState } from 'react';
import { Plus, Check, X, Wallet } from 'lucide-react';
import {
  usePettyCashAccounts,
  usePettyCashTransactions,
  useCreatePettyCashAccount,
  useCreatePettyCashTransaction,
  useApprovePettyCashTransaction,
} from '@/hooks/queries/use-petty-cash';
import { useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { PettyCashAccount, PettyCashTransaction } from '@runq/types';
import type { CreatePettyCashAccountInput, PettyCashTransactionInput } from '@runq/validators';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  EmptyState,
  CardSkeleton,
  Table,
  TableHeader,
  Th,
  TableBody,
  TableRow,
  TableCell,
  TableSkeleton,
} from '@/components/ui';
import { PettyCashAccountForm } from '@/components/forms/petty-cash-account-form';
import { PettyCashTransactionForm } from '@/components/forms/petty-cash-transaction-form';

const TXN_TYPE_VARIANT: Record<string, 'danger' | 'success'> = {
  expense: 'danger',
  replenishment: 'success',
};

const CATEGORY_LABELS: Record<string, string> = {
  office_supplies: 'Office Supplies',
  travel: 'Travel',
  food: 'Food',
  maintenance: 'Maintenance',
  other: 'Other',
};

function UtilizationBar({ balance, limit }: { balance: number; limit: number }) {
  const pct = limit > 0 ? Math.min((balance / limit) * 100, 100) : 0;
  const isLow = pct < 20;
  const isMed = pct < 50;

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{formatINR(balance)} remaining</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isLow
              ? 'bg-red-500'
              : isMed
                ? 'bg-amber-500'
                : 'bg-emerald-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TxnRow({
  txn,
  accountId,
  onApprove,
  onReject,
}: {
  txn: PettyCashTransaction;
  accountId: string;
  onApprove: (accountId: string, txnId: string) => void;
  onReject: (accountId: string, txnId: string) => void;
}) {
  const isPending = !txn.approvedBy;
  return (
    <TableRow>
      <TableCell className="text-xs text-zinc-500">{txn.transactionDate}</TableCell>
      <TableCell>
        <Badge variant={TXN_TYPE_VARIANT[txn.type] ?? 'default'}>
          {txn.type === 'expense' ? 'Expense' : 'Replenishment'}
        </Badge>
      </TableCell>
      <TableCell align="right" numeric>
        <span
          className={cn(
            'font-medium tabular-nums',
            txn.type === 'expense'
              ? 'text-red-600 dark:text-red-400'
              : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {formatINR(txn.amount)}
        </span>
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-sm">{txn.description}</TableCell>
      <TableCell>
        {txn.category ? (
          <span className="text-xs text-zinc-500">{CATEGORY_LABELS[txn.category] ?? txn.category}</span>
        ) : (
          <span className="text-zinc-300 dark:text-zinc-700">—</span>
        )}
      </TableCell>
      <TableCell>
        {isPending ? (
          <Badge variant="warning">Pending</Badge>
        ) : (
          <Badge variant="success">Approved</Badge>
        )}
      </TableCell>
      <TableCell>
        {isPending && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onApprove(accountId, txn.id)}
              className="rounded p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
              aria-label="Approve"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => onReject(accountId, txn.id)}
              className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              aria-label="Reject"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function AccountPanel({ account }: { account: PettyCashAccount }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showTxnForm, setShowTxnForm] = useState(false);

  const { data: txnData, isLoading: txnLoading } = usePettyCashTransactions(
    expanded ? account.id : '',
  );
  const txns = txnData?.data ?? [];

  const createTxnMutation = useCreatePettyCashTransaction(account.id);
  const approveMutation = useApprovePettyCashTransaction();

  function handleCreateTxn(data: PettyCashTransactionInput) {
    createTxnMutation.mutate(data, {
      onSuccess: () => {
        toast('Transaction added.', 'success');
        setShowTxnForm(false);
      },
      onError: () => toast('Failed to add transaction.', 'error'),
    });
  }

  function handleApprove(acctId: string, txnId: string) {
    approveMutation.mutate(
      { accountId: acctId, transactionId: txnId, data: { action: 'approve', notes: null } },
      {
        onSuccess: () => toast('Transaction approved.', 'success'),
        onError: () => toast('Approval failed.', 'error'),
      },
    );
  }

  function handleReject(acctId: string, txnId: string) {
    approveMutation.mutate(
      { accountId: acctId, transactionId: txnId, data: { action: 'reject', notes: null } },
      {
        onSuccess: () => toast('Transaction rejected.', 'success'),
        onError: () => toast('Rejection failed.', 'error'),
      },
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full p-5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Wallet size={20} />
            </div>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{account.name}</p>
              {account.location && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{account.location}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {formatINR(account.currentBalance)}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              of {formatINR(account.cashLimit)} limit
            </p>
          </div>
        </div>
        <div className="mt-3">
          <UtilizationBar balance={account.currentBalance} limit={account.cashLimit} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Transactions</p>
            <Button size="sm" onClick={() => setShowTxnForm((v) => !v)}>
              <Plus size={14} />
              Add Transaction
            </Button>
          </div>

          {showTxnForm && (
            <div className="px-4 pb-4">
              <PettyCashTransactionForm
                onSubmit={handleCreateTxn}
                isLoading={createTxnMutation.isPending}
                onCancel={() => setShowTxnForm(false)}
              />
            </div>
          )}

          {txnLoading ? (
            <div className="p-4">
              <TableSkeleton rows={3} cols={7} />
            </div>
          ) : txns.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-zinc-500 dark:text-zinc-400">
              No transactions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th align="right">Amount</Th>
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {txns.map((txn) => (
                  <TxnRow
                    key={txn.id}
                    txn={txn}
                    accountId={account.id}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

export function PettyCashPage() {
  const { toast } = useToast();
  const [showAccountForm, setShowAccountForm] = useState(false);
  const { data, isLoading } = usePettyCashAccounts();
  const createAccountMutation = useCreatePettyCashAccount();

  const accounts = data?.data ?? [];

  function handleCreateAccount(formData: CreatePettyCashAccountInput) {
    createAccountMutation.mutate(formData, {
      onSuccess: () => {
        toast('Petty cash account created.', 'success');
        setShowAccountForm(false);
      },
      onError: () => toast('Failed to create account.', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Banking', href: '/banking' }, { label: 'Petty Cash' }]}
        title="Petty Cash"
        description="Manage petty cash funds across locations."
        actions={
          <Button onClick={() => setShowAccountForm((v) => !v)}>
            <Plus size={16} />
            New Account
          </Button>
        }
      />

      {showAccountForm && (
        <div className="mb-6">
          <PettyCashAccountForm
            onSubmit={handleCreateAccount}
            isLoading={createAccountMutation.isPending}
            onCancel={() => setShowAccountForm(false)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No petty cash accounts"
          description="Create a petty cash account to start tracking small expenses."
          action={
            <Button size="sm" onClick={() => setShowAccountForm(true)}>
              <Plus size={14} /> New Account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map((account) => (
            <AccountPanel key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}

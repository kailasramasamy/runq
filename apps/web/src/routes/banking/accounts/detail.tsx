import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowUpDown, Landmark, Pencil, ArrowLeft } from 'lucide-react';
import { useBankAccount, useUpdateBankAccount } from '@/hooks/queries/use-bank-accounts';
import { useBankTransactions } from '@/hooks/queries/use-transactions';
import { formatINR } from '@/lib/utils';
import { BankAccountForm } from '@/components/forms/bank-account-form';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  StatsCard,
  TableSkeleton,
  Table,
  TableHeader,
  Th,
  TableBody,
  TableRow,
  TableCell,
  Modal,
  useToast,
} from '@/components/ui';
import type { BankAccount, BankTransaction } from '@runq/types';
import type { CreateBankAccountInput } from '@runq/validators';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  current: 'Current',
  savings: 'Savings',
  overdraft: 'Overdraft',
  cash_credit: 'Cash Credit',
};

const RECON_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'info'> = {
  unreconciled: 'warning',
  matched: 'success',
  manually_matched: 'info',
  excluded: 'default',
};

const RECON_LABELS: Record<string, string> = {
  unreconciled: 'Unreconciled',
  matched: 'Matched',
  manually_matched: 'Manual',
  excluded: 'Excluded',
};

const CARD_BASE = 'rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800';

function RecentTxnCard({ txn }: { txn: BankTransaction }) {
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
        </div>
      </div>
      <div className="mt-2">
        <Badge variant={RECON_VARIANT[txn.reconStatus] ?? 'default'}>
          {RECON_LABELS[txn.reconStatus] ?? txn.reconStatus}
        </Badge>
      </div>
    </div>
  );
}

function RecentTxnRow({ txn }: { txn: BankTransaction }) {
  const isCredit = txn.type === 'credit';
  return (
    <TableRow>
      <TableCell className="text-xs text-zinc-500">{txn.transactionDate}</TableCell>
      <TableCell className="max-w-xs truncate text-sm">{txn.narration ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs text-zinc-500">{txn.reference ?? '—'}</TableCell>
      <TableCell className="text-sm text-zinc-700 dark:text-zinc-300">
        {txn.vendorName ?? txn.customerName ?? '—'}
      </TableCell>
      <TableCell align="right" numeric>
        {!isCredit && (
          <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
            {formatINR(txn.amount)}
          </span>
        )}
      </TableCell>
      <TableCell align="right" numeric>
        {isCredit && (
          <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatINR(txn.amount)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={RECON_VARIANT[txn.reconStatus] ?? 'default'}>
          {RECON_LABELS[txn.reconStatus] ?? txn.reconStatus}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function EditBankAccountModal({
  account,
  open,
  onClose,
}: {
  account: BankAccount;
  open: boolean;
  onClose: () => void;
}) {
  const updateMutation = useUpdateBankAccount();
  const { toast } = useToast();

  function handleSubmit(data: CreateBankAccountInput) {
    updateMutation.mutate(
      { id: account.id, data },
      {
        onSuccess: () => {
          toast('Bank account updated.', 'success');
          onClose();
        },
        onError: () => toast('Failed to update bank account.', 'error'),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Bank Account" wide>
      <BankAccountForm
        initialData={account}
        onSubmit={handleSubmit}
        onCancel={onClose}
        isLoading={updateMutation.isPending}
      />
    </Modal>
  );
}

interface Props {
  accountId: string;
}

export function BankAccountDetailPage({ accountId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  function goBack(): void {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/banking/accounts' });
  }
  const [showEdit, setShowEdit] = useState(false);
  const { data: accountData, isLoading } = useBankAccount(accountId);
  const { data: txnData, isLoading: txnLoading } = useBankTransactions({
    accountId,
    limit: 10,
  });

  const account = accountData?.data;
  const recentTxns = txnData?.data ?? [];

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-32 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
        Account not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Banking', href: '/banking' },
          { label: 'Accounts', href: '/banking/accounts' },
          { label: account.name },
        ]}
        title={account.name}
        description={`${account.bankName} — ${account.ifscCode}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={goBack}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button variant="outline" onClick={() => setShowEdit(true)}>
              <Pencil size={14} />
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/banking/transactions' })}
            >
              <ArrowUpDown size={16} />
              View Transactions
            </Button>
          </>
        }
      />

      <EditBankAccountModal account={account} open={showEdit} onClose={() => setShowEdit(false)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Current Balance"
          value={account.currentBalance}
          icon={Landmark}
        />
        <StatsCard
          title="Opening Balance"
          value={account.openingBalance}
        />
      </div>

      <Card>
        <CardHeader title="Account Information" />
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Bank Name
              </dt>
              <dd className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {account.bankName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Account Number
              </dt>
              <dd className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                {account.accountNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                IFSC Code
              </dt>
              <dd className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                {account.ifscCode}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Account Type
              </dt>
              <dd className="mt-1">
                <Badge variant="info">
                  {ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Recent Transactions"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate({ to: '/banking/transactions', search: { accountId } })}
            >
              View All
            </Button>
          }
        />
        <CardContent className="p-0">
          {txnLoading ? (
            <>
              <div className="space-y-2 p-4 md:hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
                ))}
              </div>
              <div className="hidden p-4 md:block">
                <TableSkeleton rows={5} cols={6} />
              </div>
            </>
          ) : recentTxns.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              No transactions yet. Import a bank statement to get started.
            </p>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="space-y-2 p-4 md:hidden">
                {recentTxns.map((txn) => <RecentTxnCard key={txn.id} txn={txn} />)}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <tr>
                      <Th>Date</Th>
                      <Th>Narration</Th>
                      <Th>Reference</Th>
                      <Th>Vendor / Customer</Th>
                      <Th align="right">Debit</Th>
                      <Th align="right">Credit</Th>
                      <Th>Status</Th>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {recentTxns.map((txn) => (
                      <RecentTxnRow key={txn.id} txn={txn} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

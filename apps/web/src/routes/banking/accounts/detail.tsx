import { useNavigate } from '@tanstack/react-router';
import { ArrowUpDown, Landmark } from 'lucide-react';
import { useBankAccount } from '@/hooks/queries/use-bank-accounts';
import { useBankTransactions } from '@/hooks/queries/use-transactions';
import { formatINR } from '@/lib/utils';
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
} from '@/components/ui';
import type { BankTransaction } from '@runq/types';

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

function RecentTxnRow({ txn }: { txn: BankTransaction }) {
  const isCredit = txn.type === 'credit';
  return (
    <TableRow>
      <TableCell className="text-xs text-zinc-500">{txn.transactionDate}</TableCell>
      <TableCell className="max-w-xs truncate text-sm">{txn.narration ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs text-zinc-500">{txn.reference ?? '—'}</TableCell>
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

interface Props {
  accountId: string;
}

export function BankAccountDetailPage({ accountId }: Props) {
  const navigate = useNavigate();
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
          <Button
            variant="outline"
            onClick={() => navigate({ to: '/banking/transactions' })}
          >
            <ArrowUpDown size={16} />
            View Transactions
          </Button>
        }
      />

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
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
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
              onClick={() => navigate({ to: '/banking/transactions' })}
            >
              View All
            </Button>
          }
        />
        <CardContent className="p-0">
          {txnLoading ? (
            <div className="p-4">
              <TableSkeleton rows={5} cols={6} />
            </div>
          ) : recentTxns.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              No transactions yet. Import a bank statement to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <Th>Date</Th>
                  <Th>Narration</Th>
                  <Th>Reference</Th>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

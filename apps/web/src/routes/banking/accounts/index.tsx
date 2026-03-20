import { useNavigate } from '@tanstack/react-router';
import { Plus, Landmark } from 'lucide-react';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import type { BankAccount } from '@runq/types';
import { formatINR } from '@/lib/utils';
import { PageHeader, Badge, Button, EmptyState, CardSkeleton } from '@/components/ui';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  current: 'Current',
  savings: 'Savings',
  overdraft: 'Overdraft',
  cash_credit: 'Cash Credit',
};

const ACCOUNT_TYPE_VARIANT: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  current: 'info',
  savings: 'success',
  overdraft: 'warning',
  cash_credit: 'default',
};

function maskAccountNumber(num: string): string {
  if (num.length <= 4) return num;
  return `****${num.slice(-4)}`;
}

function AccountCard({
  account,
  onClick,
}: {
  account: BankAccount;
  onClick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(account.id)}
      className="w-full rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <Landmark size={20} />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{account.name}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{account.bankName}</p>
          </div>
        </div>
        <Badge variant={ACCOUNT_TYPE_VARIANT[account.accountType] ?? 'default'}>
          {ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}
        </Badge>
      </div>

      <div className="mt-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Current Balance</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatINR(account.currentBalance)}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Account No.</p>
          <p className="mt-0.5 font-mono text-sm text-zinc-700 dark:text-zinc-300">
            {maskAccountNumber(account.accountNumber)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">IFSC</p>
          <p className="mt-0.5 font-mono text-sm text-zinc-700 dark:text-zinc-300">
            {account.ifscCode}
          </p>
        </div>
      </div>
    </button>
  );
}

export function BankAccountListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useBankAccounts();
  const accounts = data?.data ?? [];

  function handleView(id: string) {
    navigate({ to: '/banking/accounts/$accountId', params: { accountId: id } });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Banking', href: '/banking' }, { label: 'Accounts' }]}
        title="Bank Accounts"
        description="Manage your linked bank and credit accounts."
        actions={
          <Button onClick={() => navigate({ to: '/banking/accounts/new' })}>
            <Plus size={16} />
            New Account
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No bank accounts yet"
          description="Add your first bank account to start tracking transactions."
          action={
            <Button size="sm" onClick={() => navigate({ to: '/banking/accounts/new' })}>
              <Plus size={14} /> New Account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} onClick={handleView} />
          ))}
        </div>
      )}
    </div>
  );
}

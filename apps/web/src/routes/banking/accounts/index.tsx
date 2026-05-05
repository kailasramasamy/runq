import { useNavigate } from '@tanstack/react-router';
import { Plus, Landmark, ChevronRight } from 'lucide-react';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import type { BankAccount } from '@runq/types';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Badge, StatTile, EmptyState,
} from '@/components/ar/primitives';

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

function AccountCard({ account, onClick }: { account: BankAccount; onClick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(account.id)}
      className="w-full rounded-xl border p-5 text-left transition-all hover:shadow-sm"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Landmark size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold" style={{ color: 'var(--text-1)' }}>{account.name}</div>
            <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{account.bankName}</div>
          </div>
        </div>
        <Badge variant={ACCOUNT_TYPE_VARIANT[account.accountType] ?? 'default'}>
          {ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}
        </Badge>
      </div>

      <div className="mt-4">
        <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          Current balance
        </div>
        <div className="num mt-1 text-[26px] font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
          {formatINR(account.currentBalance)}
        </div>
      </div>

      <div
        className="mt-4 flex items-center justify-between border-t pt-3 text-[11.5px]"
        style={{ borderColor: 'var(--border-soft)' }}
      >
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>Account no.</div>
          <div className="num mt-0.5" style={{ color: 'var(--text-2)' }}>{maskAccountNumber(account.accountNumber)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>IFSC</div>
          <div className="num mt-0.5" style={{ color: 'var(--text-2)' }}>{account.ifscCode}</div>
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
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

  const totalBalance = accounts.reduce((a, b) => a + Number(b.currentBalance ?? 0), 0);
  const positive = accounts.filter((a) => Number(a.currentBalance) >= 0).length;
  const overdraft = accounts.filter((a) => a.accountType === 'overdraft' || a.accountType === 'cash_credit').length;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Banking', href: '/banking/accounts' }, { label: 'Accounts' }]}
        title="Bank accounts"
        description="Linked bank and credit accounts — balances refresh on each statement import."
        actions={
          <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/banking/accounts/new' })}>
            New account
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Accounts" value={accounts.length} sub="Linked" />
        <StatTile label="Total balance" value={formatINRShort(totalBalance)} sub="Across all accounts" tone={totalBalance >= 0 ? 'pos' : 'neg'} />
        <StatTile label="In credit" value={positive} sub={`of ${accounts.length}`} />
        <StatTile label="Credit lines" value={overdraft} sub="OD / CC" tone={overdraft > 0 ? 'warn' : 'neutral'} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <EmptyState
            icon={<Landmark size={18} />}
            title="No bank accounts yet"
            description="Add your first bank account to start tracking transactions."
            action={
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/banking/accounts/new' })}>
                New account
              </Button>
            }
          />
        </div>
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

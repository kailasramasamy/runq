import { useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowUpDown, Landmark, Pencil, ArrowLeft, ShieldCheck, BarChart3 } from 'lucide-react';
import { useBankAccount, useUpdateBankAccount } from '@/hooks/queries/use-bank-accounts';
import { useBankTransactions } from '@/hooks/queries/use-transactions';
import { formatINR, formatINRShort } from '@/lib/utils';
import { BankAccountForm } from '@/components/forms/bank-account-form';
import {
  PageHeader, Badge, Button, StatTile, DetailCard, DetailRow,
  Table, TableHeader, Th, TableBody, TableRow, TableCell, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { Modal, useToast } from '@/components/ui';
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

interface Props { accountId: string }

export function BankAccountDetailPage({ accountId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const { data: accountData, isLoading } = useBankAccount(accountId);
  const { data: txnData, isLoading: txnLoading } = useBankTransactions({
    accountId,
    limit: 10,
  });

  const account = accountData?.data;
  const recentTxns = txnData?.data ?? [];

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/banking/accounts' });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        ))}
      </div>
    );
  }

  if (!account) {
    return <p className="text-[13px]" style={{ color: 'var(--neg)' }}>Account not found.</p>;
  }

  const reconciled = recentTxns.filter((t) => t.reconStatus === 'matched' || t.reconStatus === 'manually_matched').length;
  const unreconciled = recentTxns.filter((t) => t.reconStatus === 'unreconciled').length;

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[
          { label: 'Banking', href: '/banking/accounts' },
          { label: 'Accounts', href: '/banking/accounts' },
          { label: account.name },
        ]}
        title={account.name}
        titleBadge={
          <Badge variant="info">
            {ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}
          </Badge>
        }
        description={`${account.bankName} — ${account.ifscCode}`}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
            <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setShowEdit(true)}>Edit</Button>
            <Button variant="outline" size="sm" icon={<ArrowUpDown size={13} />} onClick={() => navigate({ to: '/finance/banking/transactions', search: { accountId } as never })}>
              Transactions
            </Button>
            <Button variant="outline" size="sm" icon={<BarChart3 size={13} />} onClick={() => navigate({ to: '/finance/banking/accounts/$accountId/report', params: { accountId } })}>
              Report
            </Button>
          </>
        }
      />

      <EditBankAccountModal account={account} open={showEdit} onClose={() => setShowEdit(false)} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Current balance" value={formatINRShort(Number(account.currentBalance))} sub="Live" tone={Number(account.currentBalance) >= 0 ? 'pos' : 'neg'} />
        <StatTile label="Opening balance" value={formatINRShort(Number(account.openingBalance))} sub="When linked" />
        <StatTile label="Reconciled (in view)" value={reconciled} sub="Matched txns" tone="pos" />
        <StatTile label="Unreconciled (in view)" value={unreconciled} sub="Need attention" tone={unreconciled > 0 ? 'warn' : 'neutral'} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard title="Account information" icon={<Landmark size={14} />}>
          <DetailRow label="Bank name" value={account.bankName} />
          <DetailRow label="Account number" value={account.accountNumber} mono />
          <DetailRow label="IFSC" value={account.ifscCode} mono />
          <DetailRow label="Account type" value={ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType} />
        </DetailCard>
        <DetailCard title="Compliance" icon={<ShieldCheck size={14} />}>
          <DetailRow label="Status" value={'Active'} />
          <DetailRow label="Currency" value={'INR'} />
        </DetailCard>
      </div>

      <div
        className="overflow-hidden rounded-xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} style={{ color: 'var(--text-2)' }} />
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Recent transactions</h3>
            <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>({recentTxns.length})</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/finance/banking/transactions', search: { accountId } as never })}>
            View all
          </Button>
        </div>
        {txnLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
            ))}
          </div>
        ) : recentTxns.length === 0 ? (
          <EmptyState
            icon={<ArrowUpDown size={18} />}
            title="No transactions yet"
            description="Import a bank statement to get started."
          />
        ) : (
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
              {recentTxns.map((txn: BankTransaction) => {
                const isCredit = txn.type === 'credit';
                return (
                  <TableRow key={txn.id}>
                    <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(txn.transactionDate)}</TableCell>
                    <TableCell>
                      <span className="block max-w-xs truncate" style={{ color: 'var(--text-1)' }}>{txn.narration ?? '—'}</span>
                    </TableCell>
                    <TableCell numeric style={{ color: 'var(--text-3)' }}>{txn.reference ?? '—'}</TableCell>
                    <TableCell style={{ color: 'var(--text-2)' }}>{txn.vendorName ?? txn.customerName ?? '—'}</TableCell>
                    <TableCell align="right" numeric>
                      {!isCredit && (
                        <span className="font-medium" style={{ color: 'var(--neg)' }}>{formatINR(txn.amount)}</span>
                      )}
                    </TableCell>
                    <TableCell align="right" numeric>
                      {isCredit && (
                        <span className="font-medium" style={{ color: 'var(--pos)' }}>{formatINR(txn.amount)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={RECON_VARIANT[txn.reconStatus] ?? 'default'}>
                        {RECON_LABELS[txn.reconStatus] ?? txn.reconStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function EditBankAccountModal({
  account, open, onClose,
}: { account: BankAccount; open: boolean; onClose: () => void }) {
  const updateMutation = useUpdateBankAccount();
  const { toast } = useToast();
  function handleSubmit(data: CreateBankAccountInput) {
    updateMutation.mutate(
      { id: account.id, data },
      {
        onSuccess: () => { toast('Bank account updated.', 'success'); onClose(); },
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

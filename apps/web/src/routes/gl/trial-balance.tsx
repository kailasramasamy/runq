import { BookOpen } from 'lucide-react';
import { useTrialBalance } from '@/hooks/queries/use-gl';
import type { AccountType, TrialBalanceRow } from '@runq/types';
import { PageHeader, TableSkeleton, EmptyState, Badge } from '@/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableCell, Th } from '@/components/ui';
import { formatINR } from '@/lib/utils';

const TYPE_VARIANT: Record<AccountType, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  asset: 'info',
  liability: 'warning',
  equity: 'success',
  revenue: 'default',
  expense: 'danger',
};

function TotalsRow({ rows }: { rows: TrialBalanceRow[] }) {
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <TableRow className="font-semibold border-t-2 border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/50">
      <TableCell colSpan={2}>Totals</TableCell>
      <TableCell />
      <TableCell className="text-right tabular-nums">{formatINR(totalDebit)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(totalCredit)}</TableCell>
      <TableCell className="text-right tabular-nums">
        <span className={balanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
          {balanced ? 'Balanced' : formatINR(Math.abs(totalDebit - totalCredit))}
        </span>
      </TableCell>
    </TableRow>
  );
}

export function TrialBalancePage() {
  const { data, isLoading } = useTrialBalance();
  const rows = data?.data ?? [];
  const nonZero = rows.filter((r) => r.debit > 0 || r.credit > 0 || r.balance !== 0);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'General Ledger', href: '/gl' }, { label: 'Trial Balance' }]}
        title="Trial Balance"
        description="All account balances as of today."
      />

      {isLoading ? (
        <TableSkeleton rows={15} />
      ) : nonZero.length === 0 ? (
        <EmptyState icon={BookOpen} title="No balances yet" description="Post journal entries to see the trial balance." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Code</Th>
              <Th>Account</Th>
              <Th>Type</Th>
              <Th className="text-right">Debit</Th>
              <Th className="text-right">Credit</Th>
              <Th className="text-right">Balance</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nonZero.map((row) => (
              <TableRow key={row.accountCode}>
                <TableCell className="font-mono text-sm">{row.accountCode}</TableCell>
                <TableCell>{row.accountName}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_VARIANT[row.accountType]}>{row.accountType}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.debit > 0 ? formatINR(row.debit) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{row.credit > 0 ? formatINR(row.credit) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatINR(row.balance)}</TableCell>
              </TableRow>
            ))}
            <TotalsRow rows={nonZero} />
          </TableBody>
        </Table>
      )}
    </div>
  );
}

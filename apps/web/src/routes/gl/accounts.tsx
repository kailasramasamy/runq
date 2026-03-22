import { BookOpen } from 'lucide-react';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import type { Account, AccountType } from '@runq/types';
import { PageHeader, Badge, TableSkeleton, EmptyState } from '@/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableCell, Th } from '@/components/ui';

const TYPE_VARIANT: Record<AccountType, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  asset: 'info',
  liability: 'warning',
  equity: 'success',
  revenue: 'default',
  expense: 'danger',
};

function indentLevel(code: string): number {
  if (code.length <= 1) return 0;
  // 1000 → 0, 1100 → 1, 1101 → 2
  const lastTwo = code.slice(-2);
  if (lastTwo === '00') return code.length === 4 ? 0 : 1;
  return 2;
}

function AccountRow({ account }: { account: Account }) {
  const indent = indentLevel(account.code);
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{account.code}</TableCell>
      <TableCell>
        <span style={{ paddingLeft: `${indent * 20}px` }} className="block">
          {account.name}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={TYPE_VARIANT[account.type]}>{account.type}</Badge>
      </TableCell>
      <TableCell className="text-zinc-400 font-mono text-xs">{account.parentId ? '↳' : ''}</TableCell>
    </TableRow>
  );
}

export function ChartOfAccountsPage() {
  const { data, isLoading } = useGLAccounts();
  const accountList = data?.data ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'General Ledger', href: '/gl' }, { label: 'Chart of Accounts' }]}
        title="Chart of Accounts"
        description="Indian COA based on Schedule III of Companies Act."
      />

      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : accountList.length === 0 ? (
        <EmptyState icon={BookOpen} title="No accounts found" description="Seed the chart of accounts to get started." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Level</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accountList.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Scale, ArrowRight } from 'lucide-react';
import {
  PageHeader, Button, Select, Combobox, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useLeaveBalances, useEmployees, useCarryForwardLeave,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

export function LeaveBalancesPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [employeeId, setEmployeeId] = useState('');
  const { data: empData } = useEmployees({ status: 'active', limit: 200 });
  const { data, isLoading } = useLeaveBalances({ year, employeeId: employeeId || undefined });
  const carryForward = useCarryForwardLeave();

  const balances = data?.data ?? [];
  const empOptions = [
    { value: '', label: 'All employees' },
    ...(empData?.data ?? []).map((e) => ({
      value: e.id,
      label: `${e.employeeCode} — ${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`,
    })),
  ];

  function doCarryForward() {
    carryForward.mutate({ fromYear: year, toYear: year + 1 }, {
      onSuccess: (r) => toast(`Carried forward ${r.data.moved} balances to ${year + 1}`, 'success'),
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Leave balances' }]}
        title="Leave balances"
        description="Per-employee leave balances. Year-end carry-forward respects each type's cap."
        actions={!readOnly && (
          <Button variant="outline" size="sm" onClick={doCarryForward} disabled={carryForward.isPending}>
            <ArrowRight size={13} /> Carry forward {year} → {year + 1}
          </Button>
        )}
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-32">
          <Select
            label="Year"
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        <div className="w-64">
          <Combobox label="Employee" options={empOptions} value={employeeId} onChange={setEmployeeId} />
        </div>
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{balances.length} rows</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Employee</Th>
            <Th>Type</Th>
            <Th align="right">Opening</Th>
            <Th align="right">Accrued</Th>
            <Th align="right">Used</Th>
            <Th align="right">Balance</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : balances.length === 0 ? (
            <tr><td colSpan={6}>
              <EmptyState
                icon={<Scale size={18} />}
                title="No leave balances"
                description="Balances initialize automatically when leave is requested or approved."
              />
            </td></tr>
          ) : balances.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{b.employeeName}</div>
                  <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{b.employeeCode}</div>
                </div>
              </TableCell>
              <TableCell><Badge variant="default">{b.typeCode}</Badge> <span className="ml-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{b.typeName}</span></TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(b.opening)}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(b.accrued)}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(b.used)}</TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: b.balance > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{b.balance}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

import { useState } from 'react';
import { Scale, ArrowRight, ChevronRight, ChevronDown } from 'lucide-react';
import {
  PageHeader, Button, Select, Combobox, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { EmptyState, Avatar, SearchInput } from '@/components/ar/primitives';
import {
  useLeaveBalances, useEmployees, useCarryForwardLeave, useInitializeLeaveBalances,
  type LeaveBalance,
} from '@/hooks/queries/use-hr';
import { useIsReadOnly } from '@/providers/auth-provider';

export function LeaveBalancesPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [employeeId, setEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data: empData } = useEmployees({ status: 'active', limit: 200 });
  const { data, isLoading } = useLeaveBalances({ year, employeeId: employeeId || undefined });
  const carryForward = useCarryForwardLeave();
  const initialize = useInitializeLeaveBalances();

  const balances = data?.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? balances.filter((b) =>
        b.employeeName.toLowerCase().includes(q) ||
        b.employeeCode.toLowerCase().includes(q) ||
        b.typeName.toLowerCase().includes(q) ||
        b.typeCode.toLowerCase().includes(q))
    : balances;
  const empOptions = [
    { value: '', label: 'All employees' },
    ...(empData?.data ?? []).map((e) => ({
      value: e.id,
      label: `${e.employeeCode} — ${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`,
    })),
  ];

  // Collapse the flat (employee × leave-type) rows into one group per
  // employee, with the leave types nested under an expandable header.
  const groupsMap = new Map<string, { name: string; code: string; rows: typeof filtered }>();
  for (const b of filtered) {
    if (!groupsMap.has(b.employeeId)) {
      groupsMap.set(b.employeeId, { name: b.employeeName, code: b.employeeCode, rows: [] });
    }
    groupsMap.get(b.employeeId)!.rows.push(b);
  }
  const groups = Array.from(groupsMap, ([id, g]) => ({ id, ...g }));

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.id));
  function toggleAll() {
    setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.id)));
  }

  function doCarryForward() {
    carryForward.mutate({ fromYear: year, toYear: year + 1 }, {
      onSuccess: (r) => toast(`Carried forward ${r.data.moved} balances to ${year + 1}`, 'success'),
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  function doInitialize() {
    initialize.mutate({ year }, {
      onSuccess: (r) =>
        toast(`Created ${r.data.created} balances across ${r.data.employees} employees`, 'success'),
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={doInitialize} disabled={initialize.isPending}>
              <Scale size={13} /> Initialize {year} balances
            </Button>
            <Button variant="outline" size="sm" onClick={doCarryForward} disabled={carryForward.isPending}>
              <ArrowRight size={13} /> Carry forward {year} → {year + 1}
            </Button>
          </div>
        )}
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-64">
          <SearchInput
            placeholder="Search by employee or leave type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        {groups.length > 0 && (
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        )}
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          {groups.length} employee{groups.length === 1 ? '' : 's'} · {filtered.length} balance{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Employee / Type</Th>
            <Th align="right">Opening</Th>
            <Th align="right">Accrued</Th>
            <Th align="right">Used</Th>
            <Th align="right">Balance</Th>
            <Th>Progress</Th>
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
                description="New hires are provisioned automatically. Use “Initialize balances” to back-fill all active employees for this year."
              />
            </td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={6}>
              <EmptyState icon={<Scale size={18} />} title="No balances match" description="Try a different search term." />
            </td></tr>
          ) : groups.map((g) => {
            const isExpanded = expanded.has(g.id);
            const totalBalance = g.rows.reduce((s, b) => s + b.balance, 0);
            return (
              <FragmentRows
                key={g.id}
                group={g}
                isExpanded={isExpanded}
                totalBalance={totalBalance}
                onToggle={() => toggleExpand(g.id)}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** One employee group: a clickable summary row + the nested leave-type rows. */
function FragmentRows({
  group, isExpanded, totalBalance, onToggle,
}: {
  group: { id: string; name: string; code: string; rows: LeaveBalance[] };
  isExpanded: boolean;
  totalBalance: number;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow onClick={onToggle} style={{ cursor: 'pointer' }}>
        <TableCell colSpan={4}>
          <div className="flex items-center gap-2.5">
            {isExpanded
              ? <ChevronDown size={15} style={{ color: 'var(--text-3)' }} />
              : <ChevronRight size={15} style={{ color: 'var(--text-3)' }} />}
            <Avatar name={group.name} size={28} />
            <div className="min-w-0">
              <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{group.name}</div>
              <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                {group.code} · {group.rows.length} type{group.rows.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell align="right" className="num text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>{totalBalance}</TableCell>
        <TableCell />
      </TableRow>
      {isExpanded && group.rows.map((b) => {
        const accrued = Number(b.accrued);
        const used = Number(b.used);
        const pct = accrued > 0 ? Math.round(Math.min(used / accrued, 1) * 100) : 0;
        const barColor = pct > 80 ? '#dc2626' : pct > 50 ? '#d97706' : '#16a34a';
        return (
          <TableRow key={b.id}>
            <TableCell>
              <span className="inline-flex items-center gap-1.5 pl-7">
                <span
                  className="num rounded px-1.5 py-0.5 text-[11px] font-bold"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  {b.typeCode}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>{b.typeName}</span>
              </span>
            </TableCell>
            <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(b.opening)}</TableCell>
            <TableCell align="right" className="num font-medium" style={{ color: '#16a34a' }}>+{accrued}</TableCell>
            <TableCell align="right" className="num font-medium" style={{ color: '#dc2626' }}>−{used}</TableCell>
            <TableCell align="right" className="num text-[15px] font-semibold" style={{ color: b.balance > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{b.balance}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <span className="num w-7 text-right text-[10px]" style={{ color: 'var(--text-3)' }}>{pct}%</span>
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

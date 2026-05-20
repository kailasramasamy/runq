import { useState } from 'react';
import { HardHat, Download } from 'lucide-react';
import {
  PageHeader, Button, Select, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge,
} from '@/components/ui';
import { StatTile, EmptyState, ListToolbar } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { useWageRegister, useEmployees } from '@/hooks/queries/use-hr';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function ContractLabourPage() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useWageRegister(year, month);
  const { data: wageEmps } = useEmployees({ employmentType: 'wage', limit: 200 });
  const { data: contractEmps } = useEmployees({ employmentType: 'contract', limit: 200 });

  const rows = data?.data ?? [];
  const totalDays = rows.reduce((s, r) => s + r.daysWorked + r.halfDays * 0.5, 0);
  const totalOT = rows.reduce((s, r) => s + r.otHours, 0);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        (r.agency ?? '').toLowerCase().includes(q))
    : rows;
  const filteredGross = filtered.reduce((s, r) => s + r.grossWages, 0);

  function downloadCsv() {
    api.download(`/hr/wage-register/export?year=${year}&month=${month}`, `wage-register-${year}-${String(month).padStart(2, '0')}.csv`)
      .catch((e: any) => toast(e?.message ?? 'Failed', 'error'));
  }

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Contract labour' }]}
        title="Contract labour & wage register"
        description="Monthly attendance + wage register for wage / contract employees (Form XVIII analog)."
        actions={
          <Button variant="outline" size="sm" onClick={downloadCsv}><Download size={13} /> Export CSV</Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Select label="Month" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </div>
        <div className="w-32">
          <Select label="Year" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}
            options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Wage employees" value={(wageEmps?.meta?.total ?? 0)} />
        <StatTile label="Contract employees" value={(contractEmps?.meta?.total ?? 0)} />
        <StatTile label="Total days" value={totalDays} />
        <StatTile label="Total OT hours" value={totalOT} />
      </div>

      {rows.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name, code or agency…"
          count={filtered.length}
          noun="employee"
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Code</Th>
            <Th>Employee</Th>
            <Th>Designation</Th>
            <Th>Agency</Th>
            <Th align="right">Daily rate</Th>
            <Th align="right">Days / Half / OT</Th>
            <Th align="right">Gross wages</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7}>
              <EmptyState
                icon={<HardHat size={18} />}
                title="No wage / contract employees yet"
                description="Add employees with Employment type = wage or contract, and set their daily wage rate."
              />
            </td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={7}>
              <EmptyState icon={<HardHat size={18} />} title="No employees match" description="Try a different search term." />
            </td></tr>
          ) : filtered.map((r) => (
            <TableRow key={r.employeeCode}>
              <TableCell><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{r.employeeCode}</span></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{r.employeeName}</TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{r.designation ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell>{r.agency ? <Badge variant="default">{r.agency}</Badge> : <span style={{ color: 'var(--text-3)' }}>Direct</span>}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{r.dailyWageRate ? formatINR(r.dailyWageRate) : <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{r.daysWorked} / {r.halfDays} / {r.otHours}</TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(r.grossWages)}</TableCell>
            </TableRow>
          ))}
          {filtered.length > 0 && (
            <TableRow>
              <TableCell colSpan={6}><span className="font-medium">Total</span></TableCell>
              <TableCell align="right" className="num font-semibold">{formatINR(filteredGross)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

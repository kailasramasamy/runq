import { useState } from 'react';
import { Download, Receipt } from 'lucide-react';
import {
  PageHeader, Button, Select, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { StatTile, EmptyState } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { useForm24Q } from '@/hooks/queries/use-hr-payroll';

const QUARTERS = [
  { value: '1', label: 'Q1 (Apr-Jun)' },
  { value: '2', label: 'Q2 (Jul-Sep)' },
  { value: '3', label: 'Q3 (Oct-Dec)' },
  { value: '4', label: 'Q4 (Jan-Mar)' },
];

export function Form24QPage() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor((now.getMonth()) / 3) + 1);
  const { data, isLoading } = useForm24Q(year, quarter);

  const rows = data?.data?.rows ?? [];
  const totalGross = rows.reduce((s, r) => s + r.totalGross, 0);
  const totalTds = rows.reduce((s, r) => s + r.totalTds, 0);

  function exportCsv() {
    api.download(`/hr/payroll/form-24q/export?year=${year}&quarter=${quarter}`, `form-24q-${year}-Q${quarter}.csv`)
      .catch((e: any) => toast(e?.message ?? 'Failed', 'error'));
  }

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Form 24Q' }]}
        title="Form 24Q — Quarterly TDS"
        description="Aggregated TDS on salary per employee for the selected quarter. Use this as input when filing Form 24Q with the income tax department."
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download size={13} /> Export CSV
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Select label="Quarter" value={String(quarter)} onChange={(e) => setQuarter(Number(e.target.value))} options={QUARTERS} />
        </div>
        <div className="w-32">
          <Select
            label="Year"
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Employees" value={rows.length} />
        <StatTile label="Runs covered" value={data?.data?.runs ?? 0} />
        <StatTile label="Total gross" value={formatINR(totalGross)} />
        <StatTile label="Total TDS" value={formatINR(totalTds)} />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Code</Th>
            <Th>Employee</Th>
            <Th>PAN</Th>
            <Th align="right">Months paid</Th>
            <Th align="right">Total gross</Th>
            <Th align="right">Total TDS</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6}>
              <EmptyState icon={<Receipt size={18} />} title="No payroll for this quarter" description="Process payroll runs first to see Form 24Q aggregation." />
            </td></tr>
          ) : rows.map((r) => (
            <TableRow key={r.employeeCode}>
              <TableCell><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{r.employeeCode}</span></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{r.employeeName}</TableCell>
              <TableCell className="num" style={{ color: 'var(--text-2)' }}>{r.pan ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{r.monthsPaid}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(r.totalGross)}</TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(r.totalTds)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

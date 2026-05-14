import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Calculator, ChevronRight } from 'lucide-react';
import {
  PageHeader, Button, Input, Select, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, Modal,
} from '@/components/ui';
import { StatTile, EmptyState } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import {
  usePayrollRuns, useCreatePayrollRun, type PayrollRunStatus,
} from '@/hooks/queries/use-hr-payroll';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_VARIANT: Record<PayrollRunStatus, any> = {
  draft: 'default', processed: 'info', approved: 'success', closed: 'outline',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function PayrollRunsListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = usePayrollRuns();
  const [showNew, setShowNew] = useState(false);

  const runs = data?.data ?? [];
  const totalGross = runs.reduce((s, r) => s + Number(r.totalGross), 0);
  const totalNet = runs.reduce((s, r) => s + Number(r.totalNet), 0);

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Payroll runs' }]}
        title="Payroll runs"
        description="Monthly payroll processing — calc gross, statutory deductions, payslips."
        actions={!readOnly && (
          <Button size="sm" onClick={() => setShowNew(true)}><Plus size={13} /> New run</Button>
        )}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total runs" value={runs.length} />
        <StatTile label="Total gross" value={formatINR(totalGross)} />
        <StatTile label="Total net" value={formatINR(totalNet)} />
        <StatTile label="Last run" value={runs[0] ? `${MONTHS[runs[0].month - 1]} ${runs[0].year}` : '—'} />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Period</Th>
            <Th>Status</Th>
            <Th align="right">Employees</Th>
            <Th align="right">Gross</Th>
            <Th align="right">Deductions</Th>
            <Th align="right">Net pay</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : runs.length === 0 ? (
            <tr><td colSpan={7}><EmptyState icon={<Calculator size={18} />} title="No payroll runs" description="Start a monthly run to compute salaries." /></td></tr>
          ) : runs.map((r) => (
            <TableRow key={r.id} onClick={() => navigate({ to: '/hr/payroll-runs/$runId', params: { runId: r.id } })}>
              <TableCell><span className="font-medium" style={{ color: 'var(--text-1)' }}>{MONTHS[r.month - 1]} {r.year}</span></TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{r.totalEmployees}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(Number(r.totalGross))}</TableCell>
              <TableCell align="right" className="num text-[12px]" style={{ color: '#dc2626' }}>− {formatINR(Number(r.totalDeductions))}</TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(Number(r.totalNet))}</TableCell>
              <TableCell align="right"><ChevronRight size={14} style={{ color: 'var(--text-3)' }} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showNew && <NewRunModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewRunModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreatePayrollRun();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [notes, setNotes] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ month, year, notes: notes || undefined }, {
      onSuccess: (r) => {
        toast('Run created', 'success');
        navigate({ to: '/hr/payroll-runs/$runId', params: { runId: r.data.id } });
      },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="New payroll run">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Month"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}
          />
          <Select
            label="Year"
            options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

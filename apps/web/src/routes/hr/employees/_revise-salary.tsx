import { useState } from 'react';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useAssignEmployeeSalary, usePayrollRuns, type EmployeeSalary, type PayrollRun,
} from '@/hooks/queries/use-hr-payroll';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const runLabel = (r: PayrollRun) => `${MONTHS[r.month - 1]} ${r.year}`;
const firstOfThisMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

/** Payroll runs a salary starting [from] would reprice: its month onwards. */
function runsFrom(runs: PayrollRun[], from: string) {
  const [y, m] = from.split('-').map(Number) as [number, number];
  return runs.filter((r) => r.year * 12 + r.month >= y * 12 + m);
}

/** Salary revisions, newest first, with the window each one applied. */
export function SalaryHistory({ salaries }: { salaries: EmployeeSalary[] }) {
  if (salaries.length < 2) return null;
  return (
    <div className="mt-1">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
        Salary history
      </div>
      {salaries.map((s) => (
        <div key={s.id} className="flex justify-between py-1 text-[13px]">
          <span style={{ color: 'var(--text-2)' }}>
            {s.effectiveFrom} → {s.effectiveTo ?? 'now'}
          </span>
          <span className="num font-medium" style={{ color: 'var(--text-1)' }}>
            {formatINR(Math.round(Number(s.ctcAnnual) / 12))}/mo
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Revise salary": the one place a salary changes, always with a start date. */
export function ReviseSalaryButton({ employeeId, current }: {
  employeeId: string; current?: EmployeeSalary;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Revise salary</Button>
      {open && <ReviseSalaryModal employeeId={employeeId} current={current} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReviseSalaryModal({ employeeId, current, onClose }: {
  employeeId: string; current?: EmployeeSalary; onClose: () => void;
}) {
  const { toast } = useToast();
  const assign = useAssignEmployeeSalary();
  const { data: runsData } = usePayrollRuns();
  const [monthly, setMonthly] = useState(current ? String(Math.round(Number(current.ctcAnnual) / 12)) : '');
  const [from, setFrom] = useState(firstOfThisMonth());

  const affected = from ? runsFrom(runsData?.data ?? [], from) : [];
  const paid = affected.filter((r) => r.status === 'approved' || r.status === 'closed');
  const toReprocess = affected.filter((r) => r.status === 'processed');
  const valid = Number(monthly) > 0 && !!from && paid.length === 0;

  const save = () => assign.mutate(
    {
      employeeId,
      salaryStructureId: current?.salaryStructureId ?? null,
      ctcAnnual: Number(monthly) * 12,
      effectiveFrom: from,
    },
    {
      onSuccess: () => { toast('Salary revised', 'success'); onClose(); },
      onError: (e: any) => toast(e?.message ?? 'Failed to revise salary', 'error'),
    },
  );

  return (
    <Modal open onClose={onClose} title="Revise salary">
      <div className="space-y-3">
        <Input label="New monthly salary (₹)" type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        {Number(monthly) > 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatINR(Number(monthly) * 12)} per year</p>
        )}
        <Input label="Effective from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        {paid.length > 0 && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {paid.map(runLabel).join(', ')} payroll is already approved. Start the new salary after that month.
          </p>
        )}
        {paid.length === 0 && toReprocess.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            {toReprocess.map(runLabel).join(', ')} payroll is processed. Re-process it after saving to apply the new salary.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || assign.isPending}>
            {assign.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

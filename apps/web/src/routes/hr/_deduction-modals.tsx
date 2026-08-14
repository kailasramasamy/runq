import { useState } from 'react';
import { Modal, Combobox, Input, Button, Badge, Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useCreateDeduction, useUpdateDeduction, useDeduction,
  type EmployeeDeduction, type DeductionCategory,
} from '@/hooks/queries/use-hr-recovery';

export const CATEGORY_LABEL: Record<DeductionCategory, string> = {
  goods_purchase: 'Goods purchase',
  canteen: 'Canteen',
  damage: 'Damage',
  uniform: 'Uniform',
  fine: 'Fine',
  other: 'Other',
};

export const STATUS_VARIANT: Record<string, any> = {
  active: 'success',
  recovered: 'info',
  cancelled: 'outline',
};

export const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  recovered: 'Recovered',
  cancelled: 'Cancelled',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

function monthOptions() {
  return Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }),
  }));
}

function yearOptions() {
  return Array.from({ length: 6 }, (_, i) => {
    const y = new Date().getFullYear() + i;
    return { value: String(y), label: String(y) };
  });
}

/**
 * A deduction keyed today is meant to come out of the payroll being run for
 * the month it was incurred in, so recovery defaults to this month. Pushing
 * it later is one pick away.
 */
function thisMonthYear(): { month: number; year: number } {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

// ─── Add / Edit modal ────────────────────────────────────────────────────────

export function DeductionFormModal({
  deduction,
  employees,
  onClose,
}: {
  deduction: EmployeeDeduction | null;
  employees: { id: string; firstName: string; lastName: string | null; employeeCode: string }[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateDeduction();
  const update = useUpdateDeduction();
  const isEdit = !!deduction;
  const start = thisMonthYear();

  const [employeeId, setEmployeeId] = useState(deduction?.employeeId ?? '');
  const [category, setCategory] = useState<DeductionCategory>(deduction?.category ?? 'other');
  const [description, setDescription] = useState(deduction?.description ?? '');
  const [amount, setAmount] = useState(deduction?.amount ?? '');
  const [months, setMonths] = useState('');
  const [startMonth, setStartMonth] = useState(String(deduction?.startMonth ?? start.month));
  const [startYear, setStartYear] = useState(String(deduction?.startYear ?? start.year));

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})`,
  }));

  function instalmentFromMonths(): number | undefined {
    const n = Number(months);
    if (!n || n < 1) return undefined;
    return Math.round((Number(amount) / n) * 100) / 100;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: deduction.id,
          category,
          description: description || undefined,
          instalment: instalmentFromMonths(),
          startMonth: Number(startMonth),
          startYear: Number(startYear),
        });
        toast('Deduction updated', 'success');
      } else {
        await create.mutateAsync({
          employeeId,
          category,
          description: description || undefined,
          amount: Number(amount),
          instalment: instalmentFromMonths(),
          startMonth: Number(startMonth),
          startYear: Number(startYear),
        });
        toast('Deduction added', 'success');
      }
      onClose();
    } catch (err: any) {
      toast(err?.message ?? 'Failed', 'error');
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit deduction' : 'Add deduction'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        {!isEdit && (
          <Combobox
            label="Employee"
            required
            options={employeeOptions}
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="Select employee"
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Combobox
            label="Category"
            required
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(v) => setCategory(v as DeductionCategory)}
          />
          <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {!isEdit && (
          <Input
            label="Amount (₹)"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        )}
        <Input
          label={`Recover over N months (optional — leave blank to recover ${isEdit ? '₹' + formatINR(Number(deduction?.amount ?? 0)) : 'the full amount'} in one payroll run)`}
          type="number"
          min={1}
          max={60}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Combobox label="Recovery starts (month)" options={monthOptions()} value={startMonth} onChange={setStartMonth} />
          <Combobox label="Recovery starts (year)" options={yearOptions()} value={startYear} onChange={setStartYear} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || (!isEdit && (!employeeId || !amount))}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add deduction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Detail modal ────────────────────────────────────────────────────────────

export function DeductionDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useDeduction(id);
  const d = data?.data;

  return (
    <Modal open onClose={onClose} title="Deduction detail" size="lg">
      {isLoading || !d ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Employee:</span> {[d.firstName, d.lastName].filter(Boolean).join(' ')} <span className="text-xs text-slate-500">{d.employeeCode}</span></div>
            <div><span className="text-slate-500">Category:</span> {CATEGORY_LABEL[d.category] ?? d.category}</div>
            <div><span className="text-slate-500">Amount:</span> ₹{formatINR(Number(d.amount))}</div>
            <div><span className="text-slate-500">Per-run instalment:</span> ₹{formatINR(Number(d.instalment))}</div>
            <div><span className="text-slate-500">Outstanding:</span> ₹{formatINR(Number(d.outstanding))}</div>
            <div><span className="text-slate-500">Status:</span> <Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status] ?? d.status}</Badge></div>
          </div>
          {d.description && (
            <div className="text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded">
              <span className="text-slate-500">Description:</span> {d.description}
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium mb-2">Recovery history</h4>
            {d.recoveries.length === 0 ? (
              <p className="text-sm text-slate-500">No amounts recovered yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><Th>Payroll period</Th><Th>Amount recovered</Th></TableRow>
                </TableHeader>
                <TableBody>
                  {d.recoveries.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(2000, r.month - 1, 1).toLocaleString('en-IN', { month: 'long' })} {r.year}</TableCell>
                      <TableCell>₹{formatINR(Number(r.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

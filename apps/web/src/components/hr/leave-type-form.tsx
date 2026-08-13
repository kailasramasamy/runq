import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import type { LeaveType } from '@/hooks/queries/use-hr';

export interface LeaveTypeFormValues {
  name: string;
  code: string;
  daysPerYear: number;
  accrualMode: 'upfront' | 'monthly';
  carryForward: boolean;
  maxCarryForward: number | null;
  maxBalance: number | null;
  maxPaidDaysPerMonth: number | null;
  overflowUnpaid: boolean;
  encashable: boolean;
  isPaid: boolean;
  isActive: boolean;
}

interface Props {
  /// Omit to add; pass a row to edit it.
  initial?: LeaveType;
  onSubmit: (values: LeaveTypeFormValues) => void;
  onCancel: () => void;
  pending: boolean;
}

export function LeaveTypeForm({ initial, onSubmit, onCancel, pending }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [daysPerYear, setDaysPerYear] = useState(
    initial ? String(Number(initial.daysPerYear)) : '');
  const [accrualMode, setAccrualMode] = useState<'upfront' | 'monthly'>(
    initial?.accrualMode === 'monthly' ? 'monthly' : 'upfront');
  const [carryForward, setCarryForward] = useState(initial?.carryForward ?? false);
  const [maxCarryForward, setMaxCarryForward] = useState(
    initial?.maxCarryForward != null ? String(Number(initial.maxCarryForward)) : '');
  const [maxBalance, setMaxBalance] = useState(
    initial?.maxBalance != null ? String(Number(initial.maxBalance)) : '');
  const [maxPaidPerMonth, setMaxPaidPerMonth] = useState(
    initial?.maxPaidDaysPerMonth != null ? String(Number(initial.maxPaidDaysPerMonth)) : '');
  const [overflowUnpaid, setOverflowUnpaid] = useState(initial?.overflowUnpaid ?? false);
  const [encashable, setEncashable] = useState(initial?.encashable ?? false);
  const [isPaid, setIsPaid] = useState(initial?.isPaid ?? true);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      daysPerYear: Number(daysPerYear || 0),
      accrualMode,
      carryForward,
      // Only meaningful when carry-forward is on; blank means "no cap".
      maxCarryForward: carryForward && maxCarryForward !== '' ? Number(maxCarryForward) : null,
      // Blank means uncapped — the default for every type.
      maxBalance: accrualMode === 'monthly' && maxBalance !== '' ? Number(maxBalance) : null,
      maxPaidDaysPerMonth: maxPaidPerMonth !== '' ? Number(maxPaidPerMonth) : null,
      overflowUnpaid,
      encashable,
      isPaid,
      isActive,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Casual Leave" autoFocus />
        <Input label="Code *" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="CL" />
        <Input label="Days/year" type="number" min="0" step="0.5" value={daysPerYear} onChange={(e) => setDaysPerYear(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block text-[13px]" style={{ color: 'var(--text-2)' }}>
          <span className="mb-1 block">Accrual</span>
          <select
            value={accrualMode}
            onChange={(e) => setAccrualMode(e.target.value as 'upfront' | 'monthly')}
            className="h-9 w-full rounded-md border px-2 text-[13px]"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-1)' }}
          >
            <option value="upfront">Upfront — full quota at the start</option>
            <option value="monthly">Monthly — days/year ÷ 12 each month</option>
          </select>
        </label>
        {accrualMode === 'monthly' && (
          <Input
            label="Max balance"
            type="number"
            min="0"
            step="0.5"
            value={maxBalance}
            onChange={(e) => setMaxBalance(e.target.value)}
            placeholder="No cap"
          />
        )}
        <Input
          label="Max paid days / month"
          type="number"
          min="0"
          step="0.5"
          value={maxPaidPerMonth}
          onChange={(e) => setMaxPaidPerMonth(e.target.value)}
          placeholder="No limit"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[13px]" style={{ color: 'var(--text-2)' }}>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={carryForward} onChange={(e) => setCarryForward(e.target.checked)} /> Carry forward</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={overflowUnpaid} onChange={(e) => setOverflowUnpaid(e.target.checked)} /> Extra days unpaid</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={encashable} onChange={(e) => setEncashable(e.target.checked)} /> Encashable</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /> Paid</label>
      </div>
      {carryForward && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="Max carry forward"
            type="number"
            min="0"
            step="0.5"
            value={maxCarryForward}
            onChange={(e) => setMaxCarryForward(e.target.value)}
            placeholder="No cap"
          />
        </div>
      )}
      {overflowUnpaid && (
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          Requests beyond the available balance are approved as a split — paid up to
          the balance, the rest unpaid and deducted as Loss of Pay. Leave this off and
          extra days stay fully paid, taking the balance negative.
        </p>
      )}
      {/* Retiring a type is the safe alternative to deleting one that has
          history behind it, so it only shows once the type exists. */}
      {initial && (
        <div
          className="rounded-md px-3 py-2.5 text-[13px]"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
        >
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
          {!isActive && (
            <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
              Nobody can apply for this leave and it stops accruing. Past requests stay
              on record, and employees keep seeing any unused days they've already earned.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  );
}

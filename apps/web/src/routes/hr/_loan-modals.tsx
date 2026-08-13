import { useState } from 'react';
import { MoreHorizontal, Pencil, Ban, Trash2 } from 'lucide-react';
import { Modal, Combobox, Input, Button, useToast } from '@/components/ui';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  useDisburseLoan, useUpdateLoan, useWriteOffLoan,
  type PaymentMethod,
} from '@/hooks/queries/use-hr-recovery';
import type { EmployeeLoan } from '@/hooks/queries/use-hr-phase-next';

export const STATUS_VARIANT: Record<string, any> = {
  draft: 'outline', requested: 'warning', manager_approved: 'info',
  active: 'success', rejected: 'danger', closed: 'info', written_off: 'danger',
};
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', requested: 'Pending manager', manager_approved: 'Pending HR',
  active: 'Active', rejected: 'Rejected', closed: 'Closed', written_off: 'Written off',
};
export const KIND_LABEL: Record<string, string> = {
  advance: 'Salary advance', personal: 'Personal', festival: 'Festival', education: 'Education', other: 'Other',
};

export function fmt(n: string | number) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

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

// ─── Disburse modal ──────────────────────────────────────────────────────────

export function DisburseModal({ loan, onClose }: { loan: any; onClose: () => void }) {
  const { toast } = useToast();
  const disburse = useDisburseLoan();
  const { data: banksData } = useBankAccounts();

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState('');

  const bankOptions = (banksData?.data ?? []).map((b: any) => ({ value: b.id, label: `${b.name} · ${b.bankName}` }));
  const isCash = paymentMethod === 'cash';

  function submit() {
    disburse.mutate({
      id: loan.id,
      paymentDate,
      paymentMethod,
      bankAccountId: isCash ? undefined : bankAccountId,
      reference: reference || undefined,
    }, {
      onSuccess: () => { onClose(); toast('Loan disbursed', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="Disburse loan" size="md">
      <div className="space-y-3">
        <div className="text-sm text-slate-600">
          {[loan.firstName, loan.lastName].filter(Boolean).join(' ')} — {KIND_LABEL[loan.kind] ?? loan.kind} of ₹{fmt(loan.principal)}.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Payment date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          <Combobox
            label="Method"
            options={[
              { value: 'bank_transfer', label: 'Bank transfer' },
              { value: 'cash', label: 'Cash' },
              { value: 'cheque', label: 'Cheque' },
            ]}
            value={paymentMethod}
            onChange={(v) => setPaymentMethod(v as PaymentMethod)}
          />
        </div>
        {!isCash && (
          <Combobox label="Bank account" required options={bankOptions} value={bankAccountId} onChange={setBankAccountId} placeholder="Select bank…" />
        )}
        <Input label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque number" />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={disburse.isPending || !paymentDate || (!isCash && !bankAccountId)}>
            {disburse.isPending ? 'Disbursing…' : 'Disburse'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Edit loan modal ─────────────────────────────────────────────────────────

export function EditLoanModal({ loan, onClose }: { loan: EmployeeLoan; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateLoan();

  const amountLocked = !!loan.isDisbursed || Number(loan.outstanding) < Number(loan.principal);
  const [principal, setPrincipal] = useState(loan.principal);
  const [months, setMonths] = useState('');
  const [firstMonth, setFirstMonth] = useState(String(loan.firstEmiMonth));
  const [firstYear, setFirstYear] = useState(String(loan.firstEmiYear));
  const [reason, setReason] = useState(loan.reason ?? '');

  function submit() {
    const payload: Record<string, unknown> = { id: loan.id };
    if (!amountLocked && Number(principal) !== Number(loan.principal)) payload.principal = Number(principal);
    if (months.trim() && Number(months) > 0) payload.remainingInstalments = Number(months);
    if (Number(firstMonth) !== loan.firstEmiMonth) payload.firstEmiMonth = Number(firstMonth);
    if (Number(firstYear) !== loan.firstEmiYear) payload.firstEmiYear = Number(firstYear);
    if (reason.trim() !== (loan.reason ?? '')) payload.reason = reason.trim() || undefined;

    update.mutate(payload as any, {
      onSuccess: () => { onClose(); toast('Loan updated', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="Edit loan / advance" size="md">
      <div className="space-y-3">
        <div className="text-sm text-slate-600">
          {[loan.firstName, loan.lastName].filter(Boolean).join(' ')} — {KIND_LABEL[loan.kind] ?? loan.kind}
        </div>
        <Input
          label="Principal (₹)"
          type="number"
          min={0}
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
          disabled={amountLocked}
          helper={amountLocked ? 'Locked — this advance is already disbursed or partly recovered.' : undefined}
        />
        <Input
          label="Recover remaining balance over N months (optional — leave blank to keep the current schedule)"
          type="number"
          min={1}
          max={120}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Combobox label="Repayment starts (month)" options={monthOptions()} value={firstMonth} onChange={setFirstMonth} />
          <Combobox label="Repayment starts (year)" options={yearOptions()} value={firstYear} onChange={setFirstYear} />
        </div>
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Write-off modal ─────────────────────────────────────────────────────────

export function WriteOffModal({ loan, onClose }: { loan: EmployeeLoan; onClose: () => void }) {
  const { toast } = useToast();
  const writeOff = useWriteOffLoan();
  const [reason, setReason] = useState('');

  function submit() {
    writeOff.mutate({ id: loan.id, reason: reason.trim() || undefined }, {
      onSuccess: () => { onClose(); toast('Loan written off', 'success'); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="Write off loan?" size="md">
      <div className="space-y-3">
        <div className="text-sm text-slate-600">
          {[loan.firstName, loan.lastName].filter(Boolean).join(' ')} — outstanding ₹{fmt(loan.outstanding)} will be
          zeroed and no further amounts will be recovered from payroll. History is kept.
        </div>
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={writeOff.isPending}>
            {writeOff.isPending ? 'Writing off…' : 'Write off'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Row actions menu ────────────────────────────────────────────────────────

export function LoanRowActions({
  loan, canWriteOff, onEdit, onWriteOff, onDelete,
}: {
  loan: EmployeeLoan;
  canWriteOff: boolean;
  onEdit: () => void;
  onWriteOff: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const canEdit = ['draft', 'requested', 'manager_approved', 'active'].includes(loan.status);
  const canWriteOffThis = canWriteOff && loan.status === 'active' && Number(loan.outstanding) > 0;
  const canDelete = ['draft', 'requested', 'manager_approved', 'closed'].includes(loan.status);

  if (!canEdit && !canWriteOffThis && !canDelete) return null;

  function item(icon: React.ReactNode, label: string, onClick: () => void, danger?: boolean) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(false); onClick(); }}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${danger ? 'text-red-600' : ''}`}
      >
        {icon} {label}
      </button>
    );
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} title="More actions">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <button type="button" onClick={() => setOpen(false)} className="fixed inset-0 z-10" tabIndex={-1} aria-hidden="true" />
          <div className="absolute right-0 mt-1 z-20 w-48 rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {canEdit && item(<Pencil className="h-4 w-4" />, 'Edit', onEdit)}
            {canWriteOffThis && item(<Ban className="h-4 w-4" />, 'Write off', onWriteOff, true)}
            {canDelete && item(<Trash2 className="h-4 w-4" />, 'Delete', onDelete, true)}
          </div>
        </>
      )}
    </div>
  );
}

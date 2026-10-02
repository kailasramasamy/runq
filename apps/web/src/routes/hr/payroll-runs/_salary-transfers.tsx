import { useState } from 'react';
import { CheckCircle, Undo2 } from 'lucide-react';
import { Modal, Input, Combobox, Button, Badge, useToast, ConfirmationDialog } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  useMarkSalaryTransfers, useUndoSalaryTransfer,
  type SalaryTransfer, type EmployeePaymentMethod,
} from '@/hooks/queries/use-hr-payroll';

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

// Salaries usually go out in one sitting from one bank — carry the last
// date / bank / method into the next dialog so only the UTR changes.
let lastChoice = {
  paymentDate: new Date().toISOString().slice(0, 10),
  bankAccountId: '',
  paymentMethod: 'bank_transfer' as EmployeePaymentMethod,
};

/** Paid vs balance across the run's transfers, for the KPI tiles. */
export function transferProgress(transfers: SalaryTransfer[]) {
  const paid = transfers.filter((t) => t.status === 'paid');
  const sum = (ts: SalaryTransfer[]) => ts.reduce((s, t) => s + Number(t.amount), 0);
  return {
    paidCount: paid.length,
    pendingCount: transfers.length - paid.length,
    paidAmount: sum(paid),
    balanceAmount: sum(transfers) - sum(paid),
  };
}

/** Transfer column: "Mark transferred" while pending; badge + undo once done. */
export function TransferCell({ runId, transfer, employeeName, readOnly }: {
  runId: string; transfer?: SalaryTransfer; employeeName: string; readOnly: boolean;
}) {
  const [marking, setMarking] = useState(false);
  const [undoing, setUndoing] = useState(false);
  if (!transfer) return null;
  // The row itself opens the payslip; keep these clicks to themselves.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (transfer.status === 'pending') {
    return (
      <div onClick={stop}>
        {readOnly ? <Badge variant="warning">Pending</Badge> : (
          <Button size="sm" variant="outline" onClick={() => setMarking(true)}>Mark transferred</Button>
        )}
        {marking && (
          <MarkTransferredModal runId={runId} transfer={transfer} employeeName={employeeName} onClose={() => setMarking(false)} />
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5" onClick={stop}>
      <Badge variant="success">Transferred</Badge>
      <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>
        {transfer.paymentDate}{transfer.reference ? ` · ${transfer.reference}` : ''}
      </span>
      {!readOnly && (
        <button type="button" title="Undo — back to pending" onClick={() => setUndoing(true)}
          className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" style={{ color: 'var(--text-3)' }}>
          <Undo2 size={13} />
        </button>
      )}
      {undoing && <UndoTransfer runId={runId} transfer={transfer} employeeName={employeeName} onClose={() => setUndoing(false)} />}
    </div>
  );
}

function MarkTransferredModal({ runId, transfer, employeeName, onClose }: {
  runId: string; transfer: SalaryTransfer; employeeName: string; onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: banksData } = useBankAccounts();
  const mark = useMarkSalaryTransfers(runId);
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(lastChoice.paymentDate);
  const [bankAccountId, setBankAccountId] = useState(lastChoice.bankAccountId);
  const [method, setMethod] = useState<EmployeePaymentMethod>(lastChoice.paymentMethod);
  const bankOptions = (banksData?.data ?? []).map((b: { id: string; name: string; bankName: string }) => ({
    value: b.id, label: `${b.name} · ${b.bankName}`,
  }));

  const submit = () => {
    lastChoice = { paymentDate, bankAccountId, paymentMethod: method };
    mark.mutate(
      { paymentDate, bankAccountId, paymentMethod: method, items: [{ paymentId: transfer.id, reference: reference.trim() || null }] },
      {
        onSuccess: () => { toast(`${employeeName} marked transferred`, 'success'); onClose(); },
        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title={`Mark transferred — ${employeeName}`} size="md">
      <div className="space-y-3">
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          Net pay <span className="num font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(Number(transfer.amount))}</span>
        </p>
        <Input
          label={method === 'bank_transfer' ? 'UTR / confirmation number' : 'Reference (optional)'}
          value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Transfer date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          <Combobox label="Method" options={METHODS} value={method} onChange={(v) => setMethod(v as EmployeePaymentMethod)} />
        </div>
        <Combobox label="Paid from" required options={bankOptions} value={bankAccountId} onChange={setBankAccountId} placeholder="Bank account…" />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mark.isPending} disabled={!bankAccountId || !paymentDate} onClick={submit}>
            <CheckCircle size={13} /> Mark transferred
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function UndoTransfer({ runId, transfer, employeeName, onClose }: {
  runId: string; transfer: SalaryTransfer; employeeName: string; onClose: () => void;
}) {
  const { toast } = useToast();
  const undo = useUndoSalaryTransfer(runId);
  return (
    <ConfirmationDialog
      open
      onClose={onClose}
      title="Undo transfer?"
      description={`${employeeName}'s ${formatINR(Number(transfer.amount))} goes back to pending and its accounting entry is removed.`}
      confirmLabel="Undo transfer"
      loading={undo.isPending}
      onConfirm={() => undo.mutate(transfer.id, {
        onSuccess: onClose,
        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
      })}
    />
  );
}

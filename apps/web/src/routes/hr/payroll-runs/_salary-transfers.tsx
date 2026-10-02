import { useState } from 'react';
import { CheckCircle, Undo2 } from 'lucide-react';
import { Modal, Input, Combobox, Button, Badge, useToast } from '@/components/ui';
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

const who = (t: SalaryTransfer) =>
  `${t.employeeName ?? '—'}${t.employeeLastName ? ` ${t.employeeLastName}` : ''}`;

/** Badge for one payslip row: pending, or transferred with its UTR. */
export function TransferBadge({ transfer }: { transfer?: SalaryTransfer }) {
  if (!transfer) return null;
  if (transfer.status === 'pending') return <Badge variant="warning">Pending</Badge>;
  return (
    <Badge variant="success" title={`${transfer.paymentDate}${transfer.reference ? ` · UTR ${transfer.reference}` : ''}`}>
      Transferred
    </Badge>
  );
}

/** Header summary: how much of the run has actually gone out. */
export function transferProgress(transfers: SalaryTransfer[]) {
  const pending = transfers.filter((t) => t.status === 'pending');
  return {
    done: transfers.length - pending.length,
    total: transfers.length,
    pendingAmount: pending.reduce((s, t) => s + Number(t.amount), 0),
  };
}

/** Record transfers as they go out (each with its UTR), or undo a mistake. */
export function SalaryTransfersModal({ runId, period, transfers, readOnly, onClose }: {
  runId: string; period: string; transfers: SalaryTransfer[]; readOnly: boolean; onClose: () => void;
}) {
  const pending = transfers.filter((t) => t.status === 'pending');
  const done = transfers.filter((t) => t.status === 'paid');
  return (
    <Modal open onClose={onClose} title={`Salary transfers — ${period}`} size="lg">
      <div className="space-y-5">
        {!readOnly && pending.length > 0 && <PendingForm runId={runId} pending={pending} />}
        {pending.length === 0 && (
          <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>Every salary in this run has been transferred.</p>
        )}
        {done.length > 0 && <TransferredList runId={runId} done={done} readOnly={readOnly} />}
      </div>
    </Modal>
  );
}

function PendingForm({ runId, pending }: { runId: string; pending: SalaryTransfer[] }) {
  const { toast } = useToast();
  const { data: banksData } = useBankAccounts();
  const mark = useMarkSalaryTransfers(runId);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState('');
  const [method, setMethod] = useState<EmployeePaymentMethod>('bank_transfer');
  const [picked, setPicked] = useState<Record<string, string>>({});

  const bankOptions = (banksData?.data ?? []).map((b: { id: string; name: string; bankName: string }) => ({
    value: b.id, label: `${b.name} · ${b.bankName}`,
  }));
  const ids = Object.keys(picked);
  const total = pending.filter((t) => ids.includes(t.id)).reduce((s, t) => s + Number(t.amount), 0);
  const toggle = (id: string) => setPicked((p) => {
    const next = { ...p };
    if (id in next) delete next[id]; else next[id] = '';
    return next;
  });
  const allPicked = ids.length === pending.length;

  const submit = () => mark.mutate(
    {
      paymentDate, bankAccountId, paymentMethod: method,
      items: ids.map((paymentId) => ({ paymentId, reference: picked[paymentId] || null })),
    },
    {
      onSuccess: () => { toast(`${ids.length} marked transferred`, 'success'); setPicked({}); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    },
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Transfer date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        <Combobox label="Paid from" required options={bankOptions} value={bankAccountId} onChange={setBankAccountId} placeholder="Bank account…" />
        <Combobox label="Method" options={METHODS} value={method} onChange={(v) => setMethod(v as EmployeePaymentMethod)} />
      </div>
      <div className="rounded-md border" style={{ borderColor: 'var(--border)' }}>
        <label className="flex items-center gap-2 border-b px-3 py-2 text-[12px] font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
          <input type="checkbox" checked={allPicked}
            onChange={() => setPicked(allPicked ? {} : Object.fromEntries(pending.map((t) => [t.id, picked[t.id] ?? ''])))} />
          Pending ({pending.length})
        </label>
        {pending.map((t) => (
          <PendingRow
            key={t.id}
            t={t}
            picked={t.id in picked}
            reference={picked[t.id] ?? ''}
            placeholder={method === 'bank_transfer' ? 'UTR / ref no.' : 'Ref (optional)'}
            onToggle={() => toggle(t.id)}
            onReference={(v) => setPicked((p) => ({ ...p, [t.id]: v }))}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <Button loading={mark.isPending} disabled={!ids.length || !bankAccountId || !paymentDate} onClick={submit}>
          <CheckCircle size={13} /> Mark {ids.length || ''} transferred{ids.length ? ` · ${formatINR(total)}` : ''}
        </Button>
      </div>
    </div>
  );
}

function PendingRow({ t, picked, reference, placeholder, onToggle, onReference }: {
  t: SalaryTransfer; picked: boolean; reference: string; placeholder: string;
  onToggle: () => void; onReference: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2 last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
      <input type="checkbox" checked={picked} onChange={onToggle} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{who(t)}</div>
        <div className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{t.employeeCode}</div>
      </div>
      <span className="num w-24 text-right text-[13px]" style={{ color: 'var(--text-1)' }}>{formatINR(Number(t.amount))}</span>
      <input
        className="w-40 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[13px] disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        placeholder={placeholder}
        maxLength={100}
        disabled={!picked}
        value={reference}
        onChange={(e) => onReference(e.target.value)}
      />
    </div>
  );
}

function TransferredList({ runId, done, readOnly }: { runId: string; done: SalaryTransfer[]; readOnly: boolean }) {
  const { toast } = useToast();
  const undo = useUndoSalaryTransfer(runId);
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold" style={{ color: 'var(--text-3)' }}>Transferred ({done.length})</div>
      {done.map((t) => (
        <div key={t.id} className="flex items-center gap-3 border-b py-2 text-[13px] last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{who(t)}</div>
            <div className="num text-[11px]" style={{ color: 'var(--text-3)' }}>
              {t.paymentDate} · {METHODS.find((m) => m.value === t.paymentMethod)?.label}
              {t.reference ? ` · ${t.reference}` : ''}
            </div>
          </div>
          <span className="num" style={{ color: 'var(--text-1)' }}>{formatINR(Number(t.amount))}</span>
          {!readOnly && (
            <Button variant="ghost" size="sm" title="Undo — back to pending"
              onClick={() => undo.mutate(t.id, { onError: (e: any) => toast(e?.message ?? 'Failed', 'error') })}>
              <Undo2 size={13} />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

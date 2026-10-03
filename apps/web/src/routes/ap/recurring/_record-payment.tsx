import { useState } from 'react';
import { Modal, Input, Combobox, Button, useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  useRecordRecurringPayment, type RecurringAgreementDetail, type RecurringMonth,
} from '@/hooks/queries/use-recurring-bills';

/**
 * Where the money lands, mirroring the server: the chosen periods in order
 * (or every open one, oldest first), anything left held as an advance.
 */
/** Periods the payment settles, oldest first: the ticked ones, or all open ones. */
function targetsOf(open: RecurringMonth[], chosen: string[]) {
  const oldestFirst = [...open].reverse();
  return chosen.length ? oldestFirst.filter((m) => chosen.includes(m.id)) : oldestFirst;
}

function plan(amount: number, open: RecurringMonth[], chosen: string[], asAdvance: boolean) {
  const targets = asAdvance ? [] : targetsOf(open, chosen);
  let left = amount;
  const lines: string[] = [];
  for (const m of targets) {
    if (left <= 0) break;
    const take = Math.min(left, Number(m.balance));
    lines.push(`${formatINR(take)} → ${m.label}`);
    left = Math.round((left - take) * 100) / 100;
  }
  if (left > 0) lines.push(`${formatINR(left)} held as advance`);
  return lines;
}

export function RecordPaymentModal({ agreement, onClose }: { agreement: RecurringAgreementDetail; onClose: () => void }) {
  const { toast } = useToast();
  const { data: banksData } = useBankAccounts();
  const record = useRecordRecurringPayment(agreement.id);
  const open = agreement.months.filter((m) => Number(m.balance) > 0);
  // One period's worth: the oldest unpaid balance, else a single bill (half
  // the monthly amount on a twice-a-month agreement).
  const oldestFirst = [...open].reverse();
  const defaultAmount = oldestFirst.length
    ? Number(oldestFirst[0].balance)
    : Number(agreement.amount) / (agreement.frequency === 'semi_monthly' ? 2 : 1);
  const [amount, setAmount] = useState(String(defaultAmount));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [asAdvance, setAsAdvance] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);

  const bankOptions = (banksData?.data ?? []).map((b: { id: string; name: string; bankName: string }) => ({
    value: b.id, label: `${b.name} · ${b.bankName}`,
  }));
  // Ticking periods fills in their combined due; clearing them restores the default.
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    setChosen(next);
    const total = open.filter((m) => next.includes(m.id)).reduce((s, m) => s + Number(m.balance), 0);
    setAmount(String(next.length ? total : defaultAmount));
  };
  const preview = Number(amount) > 0 ? plan(Number(amount), open, chosen, asAdvance) : [];

  const submit = () => record.mutate(
    {
      amount: Number(amount), paymentDate, bankAccountId, asAdvance,
      referenceNumber: reference.trim() || undefined,
      billIds: chosen.length && !asAdvance ? targetsOf(open, chosen).map((m) => m.id) : undefined,
    },
    {
      onSuccess: (res) => {
        const { paidToBills, heldAsAdvance } = res.data;
        toast(`Paid ${formatINR(paidToBills)} to bills, ${formatINR(heldAsAdvance)} held as advance`, 'success');
        onClose();
      },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    },
  );

  return (
    <Modal open onClose={onClose} title={`Record payment — ${agreement.title}`} size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount" required type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <Input label="Payment date" required type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <Combobox label="Paid from" required options={bankOptions} value={bankAccountId} onChange={setBankAccountId} placeholder="Bank account…" />
        <Input label="UTR / reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={50} />
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
          <input type="checkbox" checked={asAdvance} onChange={(e) => setAsAdvance(e.target.checked)} />
          Record as advance (don&apos;t apply to unpaid periods)
        </label>
        {!asAdvance && open.length > 0 && <PeriodPicker open={open} chosen={chosen} onToggle={toggle} />}
        {preview.length > 0 && (
          <div className="rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            {preview.map((l) => <div key={l} className="num">{l}</div>)}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={record.isPending} disabled={!(Number(amount) > 0) || !bankAccountId || !paymentDate} onClick={submit}>
            Record payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** "Pay for": oldest due first unless specific open periods are ticked. */
function PeriodPicker({ open, chosen, onToggle }: {
  open: RecurringMonth[]; chosen: string[]; onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-semibold" style={{ color: 'var(--text-3)' }}>
        Pay for {chosen.length === 0 && <span className="font-normal">— oldest due first</span>}
      </div>
      <div className="rounded-md border" style={{ borderColor: 'var(--border)' }}>
        {[...open].reverse().map((m) => (
          <label key={m.id} className="flex items-center gap-2 border-b px-3 py-1.5 text-[13px] last:border-0"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text-1)' }}>
            <input type="checkbox" checked={chosen.includes(m.id)} onChange={() => onToggle(m.id)} />
            <span className="flex-1">{m.label}</span>
            <span className="num" style={{ color: 'var(--text-3)' }}>{formatINR(Number(m.balance))} due</span>
          </label>
        ))}
      </div>
    </div>
  );
}

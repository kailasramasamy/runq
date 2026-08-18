import { useState } from 'react';
import { X } from 'lucide-react';
import {
  Button, Badge, Input, Combobox, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  useSettlementPayments, useRecordSettlementPayment, useVoidSettlementPayment,
  settlementDue, type ContractDetail, type ContractSettlement,
} from '@/hooks/queries/use-hr-contracts';
import { contractStatusVariant, fmtDate } from './contracts';

const today = () => new Date().toISOString().slice(0, 10);

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
];

/**
 * A settled contract, and the money going out against it.
 *
 * Approval books what is owed; this is where it gets paid off. Crews are
 * rarely paid in one go, so any number of instalments can land here and the
 * settlement only reads "paid" once the due reaches zero.
 */
export function SettlementBlock({ contract }: { contract: ContractDetail }) {
  const s = contract.settlements.find((x) => x.status !== 'cancelled')!;
  const due = settlementDue(s);
  const paid = Number(s.amountPaid);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Settlement</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{s.settlementNumber}</span>
          <Badge variant={contractStatusVariant(s.status)}>
            {s.status === 'approved' && paid > 0 ? 'part paid' : s.status}
          </Badge>
        </div>
      </div>

      <dl className="space-y-1 text-sm">
        <Money label="Earned" amount={Number(s.earned)} />
        {Number(s.advancesRecovered) > 0 && (
          <Money label="Advances recovered" amount={Number(s.advancesRecovered)} negative />
        )}
        {Number(s.otherDeductions) > 0 && (
          <Money label="Other deductions" amount={Number(s.otherDeductions)} negative />
        )}
        <Money label="Net payable" amount={Number(s.netPayable)} />
        {paid > 0 && <Money label="Paid" amount={paid} negative />}
      </dl>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          {due > 0
            ? `Still to pay · settled to ${fmtDate(s.toDate)}`
            : `Fully disbursed · settled to ${fmtDate(s.toDate)}`}
        </div>
        <div className={due > 0 ? 'text-lg font-semibold text-primary' : 'text-lg font-semibold'}>
          {formatINR(due)}
        </div>
      </div>

      <PaymentHistory settlement={s} />
      {due > 0 && s.status !== 'draft' && <PaymentForm settlement={s} due={due} />}
      {s.status === 'draft' && (
        <p className="mt-3 text-xs text-muted-foreground">
          Approve the settlement before paying it out.
        </p>
      )}
    </div>
  );
}

function PaymentHistory({ settlement }: { settlement: ContractSettlement }) {
  const { toast } = useToast();
  const { data } = useSettlementPayments(settlement.id);
  const voidPayment = useVoidSettlementPayment();
  const rows = data?.data ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Payments
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <Th>Date</Th>
            <Th>Method</Th>
            <Th>Reference</Th>
            <Th align="right">Amount</Th>
            <Th />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} className={p.voidedAt ? 'opacity-50' : undefined}>
              <TableCell>{fmtDate(p.paymentDate)}</TableCell>
              <TableCell className="text-muted-foreground">
                {METHODS.find((m) => m.value === p.paymentMethod)?.label ?? p.paymentMethod}
              </TableCell>
              <TableCell className="text-muted-foreground">{p.reference || '—'}</TableCell>
              <TableCell align="right" className="font-medium">
                {p.voidedAt ? <s>{formatINR(Number(p.amount))}</s> : formatINR(Number(p.amount))}
              </TableCell>
              <TableCell align="right">
                {!p.voidedAt && (
                  <button
                    type="button"
                    title="Reverse this payment"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      try {
                        await voidPayment.mutateAsync(p.id);
                        toast('Payment reversed', 'success');
                      } catch (e: any) {
                        toast(e?.message ?? 'Could not reverse the payment', 'error');
                      }
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Amount defaults to the whole due, which is the common case. */
function PaymentForm({ settlement, due }: { settlement: ContractSettlement; due: number }) {
  const { toast } = useToast();
  const record = useRecordSettlementPayment();
  const { data: banks } = useBankAccounts();

  const [amount, setAmount] = useState(String(due));
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState('bank_transfer');
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState('');

  const needsBank = method !== 'cash';
  const value = Number(amount);
  const tooMuch = value > due;
  const canPay =
    amount.trim() !== '' && value > 0 && !tooMuch && (!needsBank || !!bankAccountId);

  async function submit() {
    if (!canPay) return;
    try {
      await record.mutateAsync({
        settlementId: settlement.id,
        amount: value,
        paymentDate,
        paymentMethod: method,
        bankAccountId: needsBank ? bankAccountId : null,
        reference: reference.trim() || null,
      });
      setReference('');
      toast(value >= due ? 'Settlement paid in full' : 'Payment recorded', 'success');
    } catch (e: any) {
      toast(e?.message ?? 'Could not record the payment', 'error');
    }
  }

  return (
    <div className="mt-4 space-y-2 rounded-md border border-dashed border-border p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Record a payment
      </h4>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input label="Amount (₹)" type="number" min="0" value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={tooMuch ? `More than the ${formatINR(due)} due` : undefined} />
        <Input label="Paid on" type="date" value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Combobox label="Paid by" value={method}
          onChange={(v) => { setMethod(v); if (v === 'cash') setBankAccountId(''); }}
          options={METHODS} />
        {needsBank && (
          <Combobox label="From account" value={bankAccountId} onChange={setBankAccountId}
            options={(banks?.data ?? []).map((b: any) => ({
              value: b.id, label: `${b.name} · ${b.bankName}`,
            }))} />
        )}
      </div>
      <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)}
        placeholder="UTR, cheque no. — optional" />
      <Button className="w-full" onClick={submit} disabled={!canPay || record.isPending}>
        {record.isPending ? 'Saving…' : `Pay ${formatINR(Math.min(value || 0, due))}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Clears the payable and takes the money out of the account it left. Pay less
        than the full amount to record an instalment.
      </p>
    </div>
  );
}

function Money({ label, amount, negative }: { label: string; amount: number; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? 'text-muted-foreground' : 'font-medium'}>
        {negative ? '− ' : ''}{formatINR(amount)}
      </span>
    </div>
  );
}

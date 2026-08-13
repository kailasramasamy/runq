import { useState } from 'react';
import { Modal, Combobox, Input, Button, useToast } from '@/components/ui';
import { useEmployees } from '@/hooks/queries/use-hr';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useCreateAdvance, type PaymentMethod } from '@/hooks/queries/use-hr-recovery';
import { KIND_LABEL } from './_loan-modals';

type LoanKind = 'advance' | 'personal' | 'festival' | 'education' | 'other';

const LOAN_KIND_OPTIONS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));

/**
 * One-step quick advance: unlike "New loan" (draft → approve → disburse),
 * this raises the loan and records the payment in a single call — for the
 * common case of an owner/accountant handing out cash or a bank transfer on
 * the spot.
 */
export function QuickAdvanceModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateAdvance();
  const { data: empData } = useEmployees({ limit: 200, status: 'active' });
  const { data: banksData } = useBankAccounts();

  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<LoanKind>('advance');
  const [amount, setAmount] = useState('');
  const [instalments, setInstalments] = useState('1');
  const [disbursedOn, setDisbursedOn] = useState(new Date().toISOString().slice(0, 10));
  const [firstMonth, setFirstMonth] = useState(String(new Date().getMonth() + 1));
  const [firstYear, setFirstYear] = useState(String(new Date().getFullYear()));
  const [reason, setReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState('');

  const employees = empData?.data ?? [];
  const employeeOptions = employees.map((e: any) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''} (${e.employeeCode})` }));
  const bankOptions = (banksData?.data ?? []).map((b: any) => ({ value: b.id, label: `${b.name} · ${b.bankName}` }));
  const isCash = paymentMethod === 'cash';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      employeeId,
      kind,
      amount: Number(amount),
      totalInstalments: Number(instalments),
      disbursedOn,
      firstEmiMonth: Number(firstMonth),
      firstEmiYear: Number(firstYear),
      reason: reason || undefined,
      paymentMethod,
      bankAccountId: isCash ? undefined : bankAccountId,
      reference: reference || undefined,
    }, {
      onSuccess: () => { toast('Advance disbursed', 'success'); onClose(); },
      onError: (err: any) => toast(err?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="Quick advance" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Combobox label="Employee" required options={employeeOptions} value={employeeId} onChange={setEmployeeId} placeholder="Select employee" />
        <div className="grid grid-cols-2 gap-3">
          <Combobox
            label="Type"
            required
            options={LOAN_KIND_OPTIONS}
            value={kind}
            onChange={(v) => setKind(v as LoanKind)}
          />
          <Input label="Amount (₹)" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Input label="Instalments" type="number" min={1} max={60} value={instalments} onChange={(e) => setInstalments(e.target.value)} required />
          <Input label="Disbursed on" type="date" value={disbursedOn} onChange={(e) => setDisbursedOn(e.target.value)} required />
          <Combobox
            label="Repayment starts (month)"
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }) }))}
            value={firstMonth}
            onChange={setFirstMonth}
          />
          <Combobox
            label="Repayment starts (year)"
            options={Array.from({ length: 6 }, (_, i) => { const y = new Date().getFullYear() + i; return { value: String(y), label: String(y) }; })}
            value={firstYear}
            onChange={setFirstYear}
          />
          <Combobox
            label="Payment method"
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'bank_transfer', label: 'Bank transfer' },
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
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending || !employeeId || !amount || (!isCash && !bankAccountId)}>
            {create.isPending ? 'Disbursing…' : 'Disburse advance'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

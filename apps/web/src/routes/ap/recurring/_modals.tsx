import { useState } from 'react';
import { Modal, Input, Combobox, Button, useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useVendors } from '@/hooks/queries/use-vendors';
import {
  useCreateRecurringBill, useUpdateRecurringBill,
  type RecurringAgreement, type RecurringCategory, type RecurringFrequency,
} from '@/hooks/queries/use-recurring-bills';
import { CATEGORY_LABEL, DEFAULT_ACCOUNT } from './_shared';

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as RecurringCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'semi_monthly', label: 'Twice a month' },
];
const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const toFirst = (ym: string) => `${ym}-01`;

export function AgreementFormModal({ agreement, onClose }: { agreement?: RecurringAgreement; onClose: () => void }) {
  const { toast } = useToast();
  const edit = !!agreement;
  const { data: vendorsData } = useVendors({ limit: 500 });
  const create = useCreateRecurringBill();
  const update = useUpdateRecurringBill(agreement?.id ?? '');
  const [vendorId, setVendorId] = useState(agreement?.vendorId ?? '');
  const [title, setTitle] = useState(agreement?.title ?? '');
  const [category, setCategory] = useState<RecurringCategory>(agreement?.category ?? 'rent');
  const [amount, setAmount] = useState(agreement?.amount ? String(Number(agreement.amount)) : '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(agreement?.frequency ?? 'monthly');
  const [billDay, setBillDay] = useState(String(agreement?.billDay ?? 1));
  const [startMonth, setStartMonth] = useState(agreement?.startMonth.slice(0, 7) ?? thisMonth());
  const [endMonth, setEndMonth] = useState(agreement?.endMonth?.slice(0, 7) ?? '');
  const [account, setAccount] = useState(agreement?.expenseAccountCode ?? '');

  const vendorOptions = (vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name }));
  const valid = !!title.trim() && Number(amount) > 0 && (edit || !!vendorId) && (edit || !!startMonth);
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const common = {
      title: title.trim(), amount: Number(amount), billDay: Number(billDay),
      expenseAccountCode: account.trim() || null, endMonth: endMonth ? toFirst(endMonth) : null,
    };
    const opts = {
      onSuccess: () => { toast(edit ? 'Agreement updated' : 'Agreement created', 'success'); onClose(); },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    };
    if (edit) update.mutate(common, opts);
    else create.mutate({ ...common, vendorId, category, frequency, startMonth: toFirst(startMonth) }, opts);
  };

  return (
    <Modal open onClose={onClose} title={edit ? 'Edit agreement' : 'New agreement'} size="md">
      <div className="space-y-3">
        <Combobox label="Vendor" required options={vendorOptions} value={vendorId} onChange={setVendorId}
          placeholder="Search vendor…" disabled={edit} />
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Warehouse rent — Peenya" maxLength={120} />
        <div className="grid grid-cols-2 gap-3">
          <Combobox label="Type" required options={CATEGORY_OPTIONS} value={category} disabled={edit}
            onChange={(v) => setCategory(v as RecurringCategory)} />
          <Input label="Monthly amount" required type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Combobox label="Frequency" required options={FREQUENCY_OPTIONS} value={frequency} disabled={edit}
            onChange={(v) => setFrequency(v as RecurringFrequency)} />
          {frequency === 'monthly' ? (
            <Combobox label="Billed on day (next month)" required options={DAY_OPTIONS} value={billDay} onChange={setBillDay} />
          ) : (
            <p className="self-end pb-2 text-xs" style={{ color: 'var(--text-3)' }}>
              {Number(amount) > 0 ? `2 bills of ${formatINR(Number(amount) / 2)}` : 'Two bills a month'}: 1st half billed on the 16th, 2nd half on the 1st of next month
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start month" required type="month" value={startMonth} disabled={edit}
            onChange={(e) => setStartMonth(e.target.value)} />
          <Input label="End month (optional)" type="month" value={endMonth} min={startMonth}
            onChange={(e) => setEndMonth(e.target.value)} />
        </div>
        <Input label="Expense account (optional)" value={account} onChange={(e) => setAccount(e.target.value)}
          placeholder={DEFAULT_ACCOUNT[category]} maxLength={10} />
        {edit && (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Changes apply from the next bill; past months keep their amount.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={pending} disabled={!valid} onClick={submit}>{edit ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}

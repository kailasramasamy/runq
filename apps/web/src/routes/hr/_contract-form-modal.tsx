import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Modal, Button, Input, Combobox, useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useCreateContract, useUpdateContract,
  CONTRACT_TYPE_LABEL, type ContractType, type LabourContract,
} from '@/hooks/queries/use-hr-contracts';

const today = () => new Date().toISOString().slice(0, 10);

const TYPE_BLURB: Record<ContractType, string> = {
  solo_daily: 'One worker paid for the days they work.',
  task_lumpsum:
    'An agreed price for the job. You deal with the crew lead and nobody is tracked per day.',
  crew_daily: 'A crew, each person on their own daily rate.',
};

interface DraftMember {
  name: string;
  role: string;
  rate: string;
}

/**
 * Create / edit a labour contract. No employee record involved — a contract
 * carries its own name and lead person, and the end date is optional
 * because most site work runs until it is done.
 */
export function ContractFormModal({
  open,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  existing: LabourContract | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateContract();
  const update = useUpdateContract();

  const [name, setName] = useState('');
  const [lead, setLead] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<ContractType>('solo_daily');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [crew, setCrew] = useState<DraftMember[]>([{ name: '', role: '', rate: '' }]);

  const isEdit = !!existing;
  const isTask = type === 'task_lumpsum';
  const isCrew = type === 'crew_daily';

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setLead(existing.leadPersonName);
      setPhone(existing.leadPersonPhone ?? '');
      setType(existing.contractType);
      setStartDate(existing.startDate);
      setEndDate(existing.endDate ?? '');
      setAmount(existing.fixedAmount ?? '');
      setNotes(existing.notes ?? '');
    } else {
      setName(''); setLead(''); setPhone('');
      setType('solo_daily');
      setStartDate(today()); setEndDate(''); setAmount(''); setNotes('');
      setCrew([{ name: '', role: '', rate: '' }]);
    }
  }, [open, existing]);

  const amountValue = Number(amount);
  const amountValid = amount.trim() !== '' && amountValue > 0;
  const datesValid = !endDate || endDate >= startDate;
  const crewValid = crew.every((m) => m.name.trim() !== '' && Number(m.rate) > 0);

  const canSave =
    name.trim() !== '' && lead.trim() !== '' && datesValid &&
    (isEdit ? (isTask ? amountValid : true) : isCrew ? crewValid : amountValid);
  const saving = create.isPending || update.isPending;
  const crewTotal = crew.reduce((s, m) => s + (Number(m.rate) || 0), 0);

  function setMember(i: number, patch: Partial<DraftMember>) {
    setCrew((c) => c.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  async function save() {
    if (!canSave) return;
    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          name: name.trim(),
          leadPersonName: lead.trim(),
          leadPersonPhone: phone.trim() || null,
          startDate,
          endDate: endDate || null,
          fixedAmount: isTask ? amountValue : null,
          notes: notes.trim() || null,
        });
        toast('Contract updated', 'success');
      } else {
        await create.mutateAsync({
          name: name.trim(),
          leadPersonName: lead.trim(),
          leadPersonPhone: phone.trim() || null,
          contractType: type,
          startDate,
          endDate: endDate || null,
          fixedAmount: isTask ? amountValue : null,
          dailyRate: type === 'solo_daily' ? amountValue : null,
          members: isCrew
            ? crew.map((m) => ({
                name: m.name.trim(),
                role: m.role.trim() || null,
                dailyRate: Number(m.rate),
              }))
            : null,
          notes: notes.trim() || null,
        });
        toast('Contract created', 'success');
      }
      onSaved();
    } catch (e: any) {
      toast(e?.message ?? 'Could not save the contract', 'error');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit contract' : 'New contract'}>
      <div className="space-y-4">
        <Input
          label="Contract name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Warehouse flooring"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Lead person"
            required
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            placeholder="Who you deal with"
          />
          <Input
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
          />
        </div>

        {!isEdit && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              How is this paid?
            </label>
            <div className="space-y-2">
              {(Object.keys(CONTRACT_TYPE_LABEL) as ContractType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setAmount(''); }}
                  className={
                    'w-full rounded-lg border px-3 py-2.5 text-left transition-colors ' +
                    (type === t
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50')
                  }
                >
                  <div className="text-sm font-medium">{CONTRACT_TYPE_LABEL[t]}</div>
                  <div className="text-xs text-muted-foreground">{TYPE_BLURB[t]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="End date"
            type="date"
            value={endDate}
            error={datesValid ? undefined : 'End date is before the start date'}
            onChange={(e) => setEndDate(e.target.value)}
            helper={
              endDate
                ? 'Days count to this date.'
                : 'Leave blank for open-ended — settling sets the end date.'
            }
          />
        </div>

        {isTask ? (
          <Input
            label="Agreed amount (₹)"
            type="number"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="15000"
            helper="Earned in full on completion. Days are not tracked."
          />
        ) : isEdit ? (
          <p className="text-xs text-muted-foreground">
            Daily rates are managed in the crew list on the contract.
          </p>
        ) : !isCrew ? (
          <Input
            label="Daily rate (₹)"
            type="number"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="600"
            helper="Every day from the start date counts unless you mark it as leave."
          />
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Crew</label>
              {crewTotal > 0 && (
                <span className="text-xs text-muted-foreground">
                  {formatINR(crewTotal)}/day total
                </span>
              )}
            </div>
            <div className="space-y-2">
              {crew.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={m.name}
                    onChange={(e) => setMember(i, { name: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    value={m.role}
                    onChange={(e) => setMember(i, { role: e.target.value })}
                    placeholder="Role (mason)"
                  />
                  <div className="w-28 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      value={m.rate}
                      onChange={(e) => setMember(i, { rate: e.target.value })}
                      placeholder="₹/day"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={crew.length === 1}
                    onClick={() => setCrew((c) => c.filter((_, idx) => idx !== i))}
                    className="shrink-0 px-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setCrew((c) => [...c, { name: '', role: '', rate: '' }])}
            >
              <Plus size={12} /> Add person
            </Button>
          </div>
        )}

        <Input
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create contract'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

import React, { useState } from 'react';
import { CheckCircle, Send, Trash2, Banknote, Sparkles } from 'lucide-react';
import {
  Button, Input, Textarea, DateInput, Modal, Combobox, Select, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useEmployees } from '@/hooks/queries/use-hr';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  useRewardTypes, useCreateReward, useUpdateReward, useSubmitReward,
  useApproveReward, usePostReward, usePayReward, useDeleteReward,
  useSuggestRewardCitation,
  type Reward, type CreateRewardInput,
} from '@/hooks/queries/use-rewards';

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

// ─── Create / Edit modal ─────────────────────────────────────────────────────

export function RewardFormModal({
  existing,
  onClose,
}: {
  existing?: Reward;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateReward();
  const update = useUpdateReward();
  const suggestCitation = useSuggestRewardCitation();
  const { data: employeesData } = useEmployees();
  const { data: typesData } = useRewardTypes(true);

  const [employeeId, setEmployeeId] = useState(existing?.employeeId ?? '');
  const [rewardTypeId, setRewardTypeId] = useState(existing?.rewardTypeId ?? '');
  const [amount, setAmount] = useState(existing?.amount ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [citation, setCitation] = useState(existing?.citation ?? '');
  const [awardDate, setAwardDate] = useState(existing?.awardDate ?? new Date().toISOString().slice(0, 10));

  const types = typesData?.data ?? [];
  const chosenType = types.find((t) => t.id === rewardTypeId);
  const isRecognition = chosenType?.kind === 'recognition';
  const isPoints = chosenType?.kind === 'points';

  const employeeOptions = (employeesData?.data ?? []).map((e) => ({
    value: e.id,
    label: `${e.firstName}${e.lastName ? ' ' + e.lastName : ''} · ${e.employeeCode}`,
  }));
  const typeOptions = types.map((t) => ({ value: t.id, label: `${t.name} (${t.kind})` }));

  const chosenEmployee = (employeesData?.data ?? []).find((e) => e.id === employeeId);
  const chosenEmployeeName = chosenEmployee
    ? `${chosenEmployee.firstName}${chosenEmployee.lastName ? ' ' + chosenEmployee.lastName : ''}`
    : undefined;

  async function handleGenerateCitation() {
    if (!title.trim()) return;
    try {
      const res = await suggestCitation.mutateAsync({
        title: title.trim(),
        employeeName: chosenEmployeeName,
        typeName: chosenType?.name,
      });
      setCitation(res.data.citation);
    } catch (err: any) {
      toast(err?.message ?? 'Could not generate a citation', 'error');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: CreateRewardInput = {
      employeeId, rewardTypeId,
      amount: isRecognition ? 0 : Number(amount),
      title: title.trim(),
      citation: citation.trim() || undefined,
      awardDate,
    };
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, data: input });
        toast('Reward updated', 'success');
      } else {
        await create.mutateAsync(input);
        toast('Reward created', 'success');
      }
      onClose();
    } catch (err: any) {
      toast(err?.message ?? 'Failed', 'error');
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Modal open onClose={onClose} title={existing ? 'Edit reward' : 'Initiate reward'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Combobox label="Employee" options={employeeOptions} value={employeeId} onChange={setEmployeeId} placeholder="Pick employee" required />
          <Combobox label="Reward type" options={typeOptions} value={rewardTypeId} onChange={setRewardTypeId} placeholder="Pick type" required />
        </div>
        {!isRecognition && (
          <Input
            label={isPoints ? 'Points' : 'Amount (₹)'}
            type="number"
            min="1"
            step={isPoints ? '1' : '1'}
            value={amount}
            onChange={(e) => setAmount(isPoints ? String(Math.trunc(Number(e.target.value))) : e.target.value)}
            required
            placeholder={isPoints ? '100' : '5000'}
          />
        )}
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Q1 Outstanding Performance" />
        <div>
          <Textarea
            label="Citation"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            placeholder="Describe the achievement, or generate one from the title…"
            rows={3}
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={handleGenerateCitation}
              disabled={!title.trim() || suggestCitation.isPending}
              title={!title.trim() ? 'Enter a title first' : 'Draft a citation from the title'}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-violet-600 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-400 dark:hover:bg-violet-500/10"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {suggestCitation.isPending ? 'Generating…' : 'Generate from title'}
            </button>
          </div>
        </div>
        <DateInput label="Award date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} required />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{existing ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

export function RejectModal({ reward, onClose }: { reward: Reward; onClose: () => void }) {
  const { toast } = useToast();
  const approve = useApproveReward();
  const [reason, setReason] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await approve.mutateAsync({ id: reward.id, approved: false, rejectionReason: reason.trim() });
      toast('Reward rejected', 'success');
      onClose();
    } catch (err: any) {
      toast(err?.message ?? 'Failed', 'error');
    }
  }

  return (
    <Modal open onClose={onClose} title="Reject reward" size="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          Rejecting <span className="font-medium" style={{ color: 'var(--text-1)' }}>{reward.rewardNumber}</span> for {reward.employeeName}.
        </p>
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} placeholder="Why is this being rejected?" autoFocus />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="destructive" loading={approve.isPending}>Reject</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Pay modal ────────────────────────────────────────────────────────────────

export function PayModal({ reward, onClose }: { reward: Reward; onClose: () => void }) {
  const { toast } = useToast();
  const pay = usePayReward();
  const { data: banksData } = useBankAccounts();

  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash' | 'cheque'>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const bankOptions = (banksData?.data ?? []).map((b) => ({ value: b.id, label: `${b.name} · ${b.bankName}` }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await pay.mutateAsync({ id: reward.id, bankAccountId, paymentDate, paymentMethod, reference: reference || undefined, notes: notes || undefined });
      toast('Payment recorded', 'success');
      onClose();
    } catch (err: any) {
      toast(err?.message ?? 'Failed', 'error');
    }
  }

  return (
    <Modal open onClose={onClose} title={`Pay — ${reward.rewardNumber}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          Paying <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(Number(reward.amount))}</span> to {reward.employeeName}.
        </p>
        <Combobox label="Bank account" options={bankOptions} value={bankAccountId} onChange={setBankAccountId} placeholder="Select bank…" required />
        <div className="grid grid-cols-2 gap-3">
          <DateInput label="Payment date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
          <Select label="Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} options={METHOD_OPTIONS} />
        </div>
        <Input label="Reference (UTR / cheque)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR or reference number" maxLength={100} />
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" maxLength={250} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pay.isPending} disabled={!bankAccountId || !paymentDate}>
            <Banknote size={13} /> Record payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

export function RewardDetailModal({
  reward,
  onClose,
  onEdit,
  onReject,
  onPay,
}: {
  reward: Reward;
  onClose: () => void;
  onEdit: (r: Reward) => void;
  onReject: (r: Reward) => void;
  onPay: (r: Reward) => void;
}) {
  const { toast } = useToast();
  const submit = useSubmitReward();
  const approve = useApproveReward();
  const post = usePostReward();
  const remove = useDeleteReward();

  const isMonetary = reward.kind === 'monetary';
  const isRedemption = isMonetary && reward.pointsUsed != null;
  const amountDisplay = (() => {
    if (reward.kind === 'recognition') return '—';
    if (reward.kind === 'points') return `${Number(reward.amount)} pts`;
    if (isRedemption) return `↺ ${reward.pointsUsed} pts → ${formatINR(Number(reward.amount))}`;
    return Number(reward.amount) > 0 ? formatINR(Number(reward.amount)) : '—';
  })();

  async function handleAction(action: 'submit' | 'approve' | 'post' | 'delete') {
    try {
      if (action === 'submit') await submit.mutateAsync(reward.id);
      else if (action === 'approve') await approve.mutateAsync({ id: reward.id, approved: true });
      else if (action === 'post') await post.mutateAsync(reward.id);
      else if (action === 'delete') {
        if (!window.confirm(`Delete ${reward.rewardNumber}?`)) return;
        await remove.mutateAsync(reward.id);
        onClose();
        return;
      }
      toast(`${action.charAt(0).toUpperCase() + action.slice(1)}ted`, 'success');
      onClose();
    } catch (err: any) {
      toast(err?.message ?? 'Failed', 'error');
    }
  }

  const busy = submit.isPending || approve.isPending || post.isPending || remove.isPending;

  return (
    <Modal open onClose={onClose} title={reward.rewardNumber} size="md">
      <div className="space-y-3">
        {isRedemption && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400">
            <span>↺</span> Points redemption
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <DetailRow label="Employee" value={reward.employeeName} />
          <DetailRow label="Type" value={reward.typeName} />
          <DetailRow label="Amount" value={amountDisplay} mono />
          <DetailRow label="Award date" value={reward.awardDate} />
          <DetailRow label="Initiated by" value={reward.initiatorName} />
          {reward.approvedBy && <DetailRow label="Approved by" value={reward.approvedBy} />}
          {reward.rejectionReason && <DetailRow label="Rejection reason" value={reward.rejectionReason} />}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-3)' }}>Title</p>
          <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-1)' }}>{reward.title}</p>
        </div>
        {reward.citation && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-3)' }}>Citation</p>
            <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>{reward.citation}</p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          {reward.status === 'draft' && (
            <>
              <Button size="sm" variant="outline" onClick={() => onEdit(reward)}><Send size={13} /> Edit</Button>
              <Button size="sm" variant="outline" onClick={() => handleAction('submit')} loading={submit.isPending}><Send size={13} /> Submit</Button>
              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20" onClick={() => handleAction('delete')} loading={remove.isPending}><Trash2 size={13} /> Delete</Button>
            </>
          )}
          {reward.status === 'submitted' && (
            <>
              <Button size="sm" variant="outline" onClick={() => onReject(reward)}>Reject</Button>
              <Button size="sm" onClick={() => handleAction('approve')} loading={approve.isPending} disabled={busy}><CheckCircle size={13} /> Approve</Button>
            </>
          )}
          {reward.status === 'approved' && isMonetary && (
            <Button size="sm" onClick={() => handleAction('post')} loading={post.isPending} disabled={busy}>Post to GL</Button>
          )}
          {reward.status === 'posted' && (
            <Button size="sm" onClick={() => onPay(reward)}><Banknote size={13} /> Pay</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-3)' }}>{label}</p>
      <p className={`mt-0.5 truncate ${mono ? 'num' : ''}`} style={{ color: 'var(--text-1)' }}>{value}</p>
    </div>
  );
}

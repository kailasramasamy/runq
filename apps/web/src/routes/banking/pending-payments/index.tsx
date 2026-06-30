import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Paperclip } from 'lucide-react';
import {
  PageHeader, Button, Badge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState,
} from '@/components/ar/primitives';
import { Modal, Input, DateInput, Combobox, useToast } from '@/components/ui';
import {
  usePendingPayments, useUpdatePendingPayment, useCancelPendingPayment,
  type PendingPayment, type PendingPaymentStatus,
} from '@/hooks/queries/use-pending-payments';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import { formatINR } from '@/lib/utils';

type Filter = 'all' | PendingPaymentStatus;

const STATUS_FILTER = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Awaiting bank' },
  { value: 'matched', label: 'Matched' },
  { value: 'cancelled', label: 'Cancelled' },
];

function statusBadge(s: string): { label: string; variant: 'warning' | 'success' | 'default' } {
  if (s === 'matched') return { label: 'Matched to bank txn', variant: 'success' };
  if (s === 'cancelled') return { label: 'Cancelled', variant: 'default' };
  return { label: 'Awaiting bank txn', variant: 'warning' };
}

async function openAttachment(id: string): Promise<void> {
  const token = localStorage.getItem('runq-token');
  const res = await fetch(`/api/v1/common/attachments/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return;
  const url = URL.createObjectURL(await res.blob());
  if (!window.open(url, '_blank')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'confirmation';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function PendingPaymentsPage() {
  const [status, setStatus] = useState<Filter>('all');
  const [editing, setEditing] = useState<PendingPayment | null>(null);
  const { data, isLoading } = usePendingPayments(status);
  const cancelMut = useCancelPendingPayment();
  const { toast } = useToast();
  const navigate = useNavigate();
  const rows = data?.data ?? [];

  function handleCancel(p: PendingPayment) {
    if (!window.confirm('Cancel this captured payment? It will no longer match a bank transaction.')) return;
    cancelMut.mutate(p.id, {
      onSuccess: () => toast('Payment cancelled', 'success'),
      onError: (e) => toast(`Could not cancel: ${(e as Error).message}`, 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        fullWidth
        title="Pending payments"
        description="QR/UPI payments captured in the app, awaiting bank reconciliation."
        breadcrumbs={[{ label: 'Banking', href: '/finance/banking' }, { label: 'Pending payments' }]}
      />

      <div className="mb-4 max-w-xs">
        <Combobox
          label="Status"
          options={STATUS_FILTER}
          value={status}
          onChange={(v) => setStatus(v as Filter)}
        />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Date</Th>
            <Th>Category</Th>
            <Th>Paid to</Th>
            <Th>Note</Th>
            <Th>Bank</Th>
            <Th align="right">Amount</Th>
            <Th>Status</Th>
            <Th align="right">Actions</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const b = statusBadge(p.status);
            const bank = [p.bankAccountName, p.bankAccountNumber ? `··· ${p.bankAccountNumber.slice(-4)}` : '']
              .filter(Boolean).join(' ');
            return (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{p.paymentDate}</TableCell>
                <TableCell className="text-sm">{p.glAccountName ?? '—'}</TableCell>
                <TableCell className="text-sm">{p.payeeName ?? '—'}</TableCell>
                <TableCell className="max-w-xs"><span className="block truncate text-sm text-zinc-600 dark:text-zinc-400">{p.note ?? '—'}</span></TableCell>
                <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">{bank || '—'}</TableCell>
                <TableCell align="right" numeric>{formatINR(parseFloat(p.amount))}</TableCell>
                <TableCell><Badge variant={b.variant}>{b.label}</Badge></TableCell>
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-2">
                    {p.attachmentId && (
                      <button type="button" title="View confirmation" onClick={() => openAttachment(p.attachmentId!)}
                        className="text-zinc-500 hover:text-indigo-600 dark:text-zinc-400">
                        <Paperclip className="h-4 w-4" />
                      </button>
                    )}
                    {p.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleCancel(p)}>Cancel</Button>
                      </>
                    )}
                    {p.matchedBankTransactionId && (
                      <Button size="sm" variant="ghost"
                        onClick={() => navigate({ to: '/finance/banking/transactions', search: { accountId: p.bankAccountId } as never })}>
                        View txn
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!isLoading && rows.length === 0 && (
        <EmptyState title="No pending payments" description="Captures from the app appear here until the bank statement matches them." />
      )}

      {editing && <EditModal payment={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditModal({ payment, onClose }: { payment: PendingPayment; onClose: () => void }) {
  const update = useUpdatePendingPayment();
  const { toast } = useToast();
  const { data: banksData } = useBankAccounts();
  const { data: glData } = useGLAccounts();

  const [bankAccountId, setBankAccountId] = useState(payment.bankAccountId);
  const [amount, setAmount] = useState(payment.amount);
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate);
  const [glAccountId, setGlAccountId] = useState(payment.glAccountId);
  const [payeeName, setPayeeName] = useState(payment.payeeName ?? '');
  const [note, setNote] = useState(payment.note ?? '');
  const [upiRef, setUpiRef] = useState(payment.upiRef ?? '');

  const bankOptions = (banksData?.data ?? []).map((b) => ({ value: b.id, label: `${b.bankName} ···${b.accountNumber.slice(-4)}` }));
  const glOptions = (glData?.data ?? []).filter((a) => a.type === 'expense').map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));

  function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
    update.mutate({
      id: payment.id,
      bankAccountId, amount: amt, paymentDate, glAccountId,
      payeeName: payeeName.trim() || null,
      note: note.trim() || null,
      upiRef: upiRef.trim() || null,
    }, {
      onSuccess: () => { toast('Payment updated', 'success'); onClose(); },
      onError: (e) => toast(`Could not save: ${(e as Error).message}`, 'error'),
    });
  }

  return (
    <Modal open onClose={onClose} title="Edit captured payment">
      <div className="flex flex-col gap-4">
        <Combobox label="Paid from" options={bankOptions} value={bankAccountId} onChange={setBankAccountId} />
        <Input label="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Combobox label="Expense category" options={glOptions} value={glAccountId} onChange={setGlAccountId} placeholder="Search category…" />
        <DateInput label="Payment date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        <Input label="Paid to" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="e.g. Ramesh transport" />
        <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What for" />
        <Input label="UPI reference" value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="UTR / UPI txn id" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={update.isPending}>Save changes</Button>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  Button, Badge, Input, Combobox, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  usePayAdvance, useCancelAdvance, type ContractDetail,
} from '@/hooks/queries/use-hr-contracts';
import { contractStatusVariant, fmtDate } from './contracts';

const today = () => new Date().toISOString().slice(0, 10);

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
];

/**
 * Advances against a running contract, and the form to pay another.
 *
 * An advance is money owed back rather than a wage, so it is recorded as an
 * asset and only nets off when the contract is settled — which is why this
 * closes as soon as a settlement exists.
 */
export function Advances({ contract }: { contract: ContractDetail }) {
  const { toast } = useToast();
  const pay = usePayAdvance();
  const cancel = useCancelAdvance();
  const { data: banks } = useBankAccounts();

  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState('cash');
  const [bankAccountId, setBankAccountId] = useState('');
  const [memberId, setMemberId] = useState('');

  const settled = contract.settlements.some((s) => s.status !== 'cancelled');
  const needsBank = method !== 'cash';
  const needsMember = contract.members.length > 1;
  const amountValue = Number(amount);
  const canPay =
    contract.status === 'active' && !settled &&
    amount.trim() !== '' && amountValue > 0 &&
    (!needsBank || !!bankAccountId) && (!needsMember || !!memberId);

  const memberName = (id: string | null) =>
    contract.members.find((m) => m.id === id)?.name ?? null;

  async function submit() {
    if (!canPay) return;
    try {
      await pay.mutateAsync({
        contractId: contract.id,
        amount: amountValue,
        paidOn,
        memberId: memberId || contract.members[0]?.id || null,
        paymentMethod: method,
        bankAccountId: needsBank ? bankAccountId : null,
      });
      setAmount('');
      toast('Advance recorded', 'success');
    } catch (e: any) {
      toast(e?.message ?? 'Could not record the advance', 'error');
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">Advances</h3>
      {contract.advances.length === 0 ? (
        <p className="text-sm text-muted-foreground">No advances paid yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Date</Th>
              <Th>To</Th>
              <Th align="right">Amount</Th>
              <Th>Status</Th>
              <Th />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contract.advances.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{fmtDate(a.paidOn)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {memberName(a.memberId) ?? contract.leadPersonName}
                </TableCell>
                <TableCell align="right" className="font-medium">
                  {formatINR(Number(a.amount))}
                </TableCell>
                <TableCell>
                  <Badge variant={contractStatusVariant(a.status)}>{a.status}</Badge>
                </TableCell>
                <TableCell align="right">
                  {contract.status === 'active' && a.status === 'paid' && (
                    <button
                      type="button"
                      title="Reverse this advance"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        try {
                          await cancel.mutateAsync(a.id);
                          toast('Advance reversed', 'success');
                        } catch (e: any) {
                          toast(e?.message ?? 'Could not reverse', 'error');
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
      )}

      {contract.status === 'active' && !settled && (
        <div className="mt-3 space-y-2 rounded-md border border-dashed border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Amount (₹)" type="number" min="0" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="2000" />
            <Input label="Paid on" type="date" value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          {needsMember && (
            <Combobox
              label="Paid to"
              value={memberId}
              onChange={setMemberId}
              options={contract.members.map((m) => ({
                value: m.id,
                label: m.role ? `${m.name} · ${m.role}` : m.name,
              }))}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
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
          <Button className="w-full" onClick={submit} disabled={!canPay || pay.isPending}>
            {pay.isPending ? 'Saving…' : 'Pay advance'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Recorded as money owed back, not a wage expense — recovered when the
            contract is settled.
          </p>
        </div>
      )}
    </div>
  );
}

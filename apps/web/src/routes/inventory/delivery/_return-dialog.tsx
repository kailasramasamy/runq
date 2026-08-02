import { useState } from 'react';
import { Button, Input, useToast, Table, TableHeader, TableBody, TableRow, TableCell, Th } from '@/components/ui';
import { useReturnableLines, useCreateSalesReturn } from '@/hooks/queries/use-sales-dispatch';

/**
 * Record goods coming back against a dispatch.
 *
 * Quantities are capped at what's still returnable and the cost is fixed to
 * the original dispatch cost server-side, so this dialog only ever asks the
 * two things a human knows: how much came back, and why.
 */
export function ReturnDialog({ dnId, onClose }: { dnId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: lines = [], isLoading } = useReturnableLines(dnId);
  const createReturn = useCreateSalesReturn();

  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [qtys, setQtys] = useState<Record<string, number | ''>>({});

  const returnable = lines.filter((l) => l.returnableQty > 0);
  const picked = returnable
    .map((l) => ({ dnLineId: l.id, qty: Number(qtys[l.id] ?? 0) }))
    .filter((l) => l.qty > 0);
  const total = returnable
    .filter((l) => Number(qtys[l.id] ?? 0) > 0)
    .reduce((s, l) => s + Number(qtys[l.id] ?? 0) * Number(l.unitCost), 0);

  async function submit() {
    if (!reason.trim()) return toast('Reason required', 'error');
    if (picked.length === 0) return toast('Enter a quantity on at least one line', 'error');
    try {
      await createReturn.mutateAsync({
        dnId,
        body: { returnDate, reason: reason.trim(), lines: picked },
      });
      toast('Return recorded — stock back on hand', 'success');
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to record return', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-1 text-base font-semibold">Record a return</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Goods go back on hand at the cost they left with. Raise the credit
          note separately in Finance — this moves stock only.
        </p>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Return date</label>
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Reason</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged in transit"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading lines…</p>
        ) : returnable.length === 0 ? (
          <p className="text-sm text-zinc-500">Everything on this dispatch has already been returned.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Item</Th>
                <Th>Batch</Th>
                <Th className="text-right">Sent</Th>
                <Th className="text-right">Already back</Th>
                <Th className="text-right">Returning</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnable.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.itemName}</TableCell>
                  <TableCell className="font-mono text-xs">{l.batchNo ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.dispatchedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.returnedQty}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      max={l.returnableQty}
                      step="0.001"
                      value={qtys[l.id] ?? ''}
                      onChange={(e) => setQtys((p) => ({
                        ...p, [l.id]: e.target.value === '' ? '' : Number(e.target.value),
                      }))}
                      className="h-8 w-24 py-0 text-right text-[12.5px]"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm">
            Value back: <span className="font-mono font-semibold">
              ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Back</Button>
            <Button variant="primary" onClick={submit} loading={createReturn.isPending}>
              Record return
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

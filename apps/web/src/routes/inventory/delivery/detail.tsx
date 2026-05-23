import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, useToast, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Input,
} from '@/components/ui';
import { useDn, useDispatchDn, useCancelDn } from '@/hooks/queries/use-inventory';

export function DeliveryNoteDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { toast } = useToast();
  const { data: dn, isLoading } = useDn(id);
  const dispatch = useDispatchDn();
  const cancel = useCancelDn();

  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading || !dn) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  async function doDispatch() {
    try {
      await dispatch.mutateAsync(id);
      toast('Dispatched — stock + COGS booked', 'success');
      setConfirmDispatch(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to dispatch', 'error');
    }
  }

  async function doCancel() {
    if (!reason.trim()) return toast('Reason required', 'error');
    try {
      await cancel.mutateAsync({ id, reason: reason.trim() });
      toast('Cancelled', 'success');
      setCancelOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title={dn.dnNo}
        titleBadge={<StatusBadge status={dn.status} />}
        description={`Dispatch ${dn.dispatchDate} · ${dn.warehouseName}${dn.customerName ? ` · ${dn.customerName}` : ''}`}
        actions={
          <div className="flex gap-2">
            {dn.status === 'draft' && (
              <Button variant="primary" onClick={() => setConfirmDispatch(true)}>Dispatch</Button>
            )}
            {dn.status !== 'cancelled' && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel</Button>
            )}
            <Link to="/inventory/delivery"><Button variant="secondary">Back</Button></Link>
          </div>
        }
      />

      <Card>
        <CardHeader><h3 className="text-sm font-semibold">Lines</h3></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Item</Th>
                <Th>Batch</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Unit cost</Th>
                <Th className="text-right">COGS</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dn.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.itemName}</TableCell>
                  <TableCell className="font-mono text-xs">{l.batchNo ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(l.qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {l.uom ?? ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{Number(l.unitCost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{Number(l.lineTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 flex justify-end text-sm">
            COGS: <span className="ml-2 font-mono font-semibold">₹{Number(dn.totalValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </CardContent>
      </Card>

      {dn.notes && (
        <Card className="mt-4">
          <CardHeader><h3 className="text-sm font-semibold">Notes</h3></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm">{dn.notes}</p></CardContent>
        </Card>
      )}

      <ConfirmationDialog
        open={confirmDispatch}
        onClose={() => setConfirmDispatch(false)}
        onConfirm={doDispatch}
        title="Dispatch this delivery?"
        description="Stock will be removed from the warehouse and COGS will be booked. Reversible via cancel."
        confirmLabel="Dispatch"
        variant="warning"
        loading={dispatch.isPending}
      />

      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold">Cancel delivery?</h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Dispatched deliveries are cancelled by writing reversal entries + a reversal JE.
            </p>
            <label className="mb-1 block text-sm font-medium">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelOpen(false)}>Back</Button>
              <Button variant="destructive" onClick={doCancel} loading={cancel.isPending}>Confirm cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'dispatched' | 'cancelled' }) {
  const m = { draft: ['default', 'Draft'], dispatched: ['success', 'Dispatched'], cancelled: ['danger', 'Cancelled'] } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}

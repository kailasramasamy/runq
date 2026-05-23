import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, useToast, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Input,
} from '@/components/ui';
import { useTransfer, useDispatchTransfer, useReceiveTransfer, useCancelTransfer } from '@/hooks/queries/use-inventory';

export function TransferDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { toast } = useToast();
  const { data: t, isLoading } = useTransfer(id);
  const dispatch = useDispatchTransfer();
  const receive = useReceiveTransfer();
  const cancel = useCancelTransfer();

  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  // Per-line received qty (allows short-receipt). Keyed by line id.
  const [recvMap, setRecvMap] = useState<Record<string, string>>({});

  if (isLoading || !t) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  async function doDispatch() {
    try {
      await dispatch.mutateAsync(id);
      toast('Dispatched — stock pulled from source, in transit', 'success');
      setConfirmDispatch(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function doReceive() {
    try {
      const lineReceipts = t!.lines
        .map((l) => {
          const raw = recvMap[l.id];
          if (raw === undefined || raw === '') return null;
          return { lineId: l.id, qtyReceived: Number(raw) };
        })
        .filter((x): x is { lineId: string; qtyReceived: number } => x !== null);
      await receive.mutateAsync({ id, lineReceipts: lineReceipts.length ? lineReceipts : undefined });
      toast('Received at destination', 'success');
      setConfirmReceive(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function doCancel() {
    if (!reason.trim()) return toast('Reason required', 'error');
    try {
      await cancel.mutateAsync({ id, reason: reason.trim() });
      toast('Cancelled', 'success');
      setCancelOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title={t.transferNo}
        titleBadge={<StatusBadge status={t.status} />}
        description={`${t.fromWarehouseName} → ${t.toWarehouseName}${t.vehicleNo ? ` · ${t.vehicleNo}` : ''}`}
        actions={
          <div className="flex gap-2">
            {t.status === 'draft' && (
              <Button variant="primary" onClick={() => setConfirmDispatch(true)}>Dispatch</Button>
            )}
            {t.status === 'in_transit' && (
              <Button variant="primary" onClick={() => setConfirmReceive(true)}>Receive</Button>
            )}
            {(t.status === 'draft' || t.status === 'in_transit') && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel</Button>
            )}
            <Link to="/inventory/transfers"><Button variant="secondary">Back</Button></Link>
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
                <Th className="text-right">Dispatched</Th>
                <Th className="text-right">Received</Th>
                <Th className="text-right">Unit cost</Th>
                <Th className="text-right">Line total</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.itemName}</TableCell>
                  <TableCell className="font-mono text-xs">{l.batchNo ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(l.qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.status === 'in_transit' ? (
                      <Input
                        type="number" step="0.001" min="0" className="w-24 text-right"
                        placeholder={Number(l.qty).toString()}
                        value={recvMap[l.id] ?? ''}
                        onChange={(e) => setRecvMap((m) => ({ ...m, [l.id]: e.target.value }))}
                      />
                    ) : (
                      Number(l.qtyReceived).toLocaleString('en-IN', { maximumFractionDigits: 3 })
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">₹{Number(l.unitCost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{Number(l.lineTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {t.status === 'in_transit' && (
            <p className="mt-3 text-xs text-zinc-500">
              Blank received → defaults to full dispatched qty. Short receipts allowed; over-receipt is rejected.
            </p>
          )}
        </CardContent>
      </Card>

      {t.notes && (
        <Card className="mt-4">
          <CardHeader><h3 className="text-sm font-semibold">Notes</h3></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm">{t.notes}</p></CardContent>
        </Card>
      )}

      <ConfirmationDialog
        open={confirmDispatch}
        onClose={() => setConfirmDispatch(false)}
        onConfirm={doDispatch}
        title="Dispatch this transfer?"
        description={`Stock will be pulled out of ${t.fromWarehouseName} and held in transit until received at ${t.toWarehouseName}.`}
        confirmLabel="Dispatch"
        variant="warning"
        loading={dispatch.isPending}
      />

      <ConfirmationDialog
        open={confirmReceive}
        onClose={() => setConfirmReceive(false)}
        onConfirm={doReceive}
        title="Receive this transfer?"
        description={`Stock will be added at ${t.toWarehouseName} per the received quantities above.`}
        confirmLabel="Receive"
        variant="warning"
        loading={receive.isPending}
      />

      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold">Cancel transfer?</h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              In-transit transfers are cancelled by returning the stock to the source warehouse.
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

function StatusBadge({ status }: { status: 'draft' | 'in_transit' | 'received' | 'cancelled' }) {
  const m = {
    draft: ['default', 'Draft'],
    in_transit: ['info', 'In transit'],
    received: ['success', 'Received'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}

import { useState } from 'react';
import { useParams, useNavigate, Link } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, useToast, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Input,
} from '@/components/ui';
import { useGrn, usePostGrn, useCancelGrn } from '@/hooks/queries/use-inventory';

export function GrnDetailPage() {
  const { id } = useParams({ from: '/inventory/grn/$id' as never }) as { id: string };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: grn, isLoading } = useGrn(id);
  const post = usePostGrn();
  const cancel = useCancelGrn();

  const [confirmPost, setConfirmPost] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  if (isLoading || !grn) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  async function doPost() {
    try {
      await post.mutateAsync(id);
      toast('GRN posted — stock + JE recorded', 'success');
      setConfirmPost(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to post', 'error');
    }
  }

  async function doCancel() {
    if (!cancelReason.trim()) return toast('Reason required', 'error');
    try {
      await cancel.mutateAsync({ id, reason: cancelReason.trim() });
      toast('GRN cancelled', 'success');
      setCancelOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title={grn.grnNo}
        titleBadge={<StatusBadge status={grn.status} />}
        description={`Received ${grn.receivedDate} · ${grn.warehouseName}${grn.vendorName ? ` · ${grn.vendorName}` : ''}`}
        actions={
          <div className="flex gap-2">
            {grn.status === 'draft' && (
              <Button variant="primary" onClick={() => setConfirmPost(true)}>Post GRN</Button>
            )}
            {grn.status !== 'cancelled' && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel</Button>
            )}
            <Link to="/inventory/grn"><Button variant="secondary">Back</Button></Link>
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
                <Th>Expiry</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Total</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grn.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.itemName}</TableCell>
                  <TableCell className="font-mono text-xs">{l.batchNo ?? '—'}</TableCell>
                  <TableCell>{l.expiryDate ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(l.qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {l.uom ?? ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{Number(l.unitRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{Number(l.lineTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 flex justify-end text-sm">
            <div>Total value: <span className="font-mono font-semibold">₹{Number(grn.totalValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
          </div>
        </CardContent>
      </Card>

      {grn.notes && (
        <Card className="mt-4">
          <CardHeader><h3 className="text-sm font-semibold">Notes</h3></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm">{grn.notes}</p></CardContent>
        </Card>
      )}

      {grn.journalEntryId && (
        <p className="mt-4 text-xs text-zinc-500">Linked journal entry: <span className="font-mono">{grn.journalEntryId}</span></p>
      )}

      <ConfirmationDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={doPost}
        title="Post this GRN?"
        description="Stock will be added to the warehouse and a journal entry will be created. This can be reversed via cancel."
        confirmLabel="Post"
        variant="warning"
        loading={post.isPending}
      />

      <CancelDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={doCancel}
        reason={cancelReason}
        setReason={setCancelReason}
        loading={cancel.isPending}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'posted' | 'cancelled' }) {
  const m = { draft: ['default', 'Draft'], posted: ['success', 'Posted'], cancelled: ['danger', 'Cancelled'] } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}

function CancelDialog({
  open, onClose, onConfirm, reason, setReason, loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  reason: string; setReason: (s: string) => void; loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-1 text-base font-semibold">Cancel GRN?</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Posted GRNs are cancelled by writing reversal ledger entries + a reversal JE — nothing is hard-deleted.
        </p>
        <label className="mb-1 block text-sm font-medium">Reason</label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong vendor invoice" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Back</Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>Confirm cancel</Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, useToast, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Input,
} from '@/components/ui';
import {
  useAdjustment, useApproveAdjustment, usePostAdjustment, useCancelAdjustment,
} from '@/hooks/queries/use-inventory';

const REASON_LABELS: Record<string, string> = {
  damage: 'Damage', expiry: 'Expiry', theft: 'Theft', found: 'Found',
  revaluation: 'Revaluation', correction: 'Correction', opening_balance: 'Opening',
};

export function AdjustmentDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { toast } = useToast();
  const { data: a, isLoading } = useAdjustment(id);
  const approve = useApproveAdjustment();
  const post = usePostAdjustment();
  const cancel = useCancelAdjustment();

  const [confirmPost, setConfirmPost] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading || !a) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  async function doApprove() {
    try { await approve.mutateAsync(id); toast('Approved', 'success'); }
    catch (err) { toast(err instanceof Error ? err.message : 'Failed', 'error'); }
  }
  async function doPost() {
    try {
      await post.mutateAsync(id);
      toast('Posted — ledger + JE recorded', 'success');
      setConfirmPost(false);
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

  const delta = Number(a.totalValueDelta);

  return (
    <div>
      <PageHeader
        title={a.adjNo}
        titleBadge={<StatusBadge status={a.status} />}
        description={`${a.adjustmentDate} · ${a.warehouseName} · ${REASON_LABELS[a.reason] ?? a.reason}`}
        actions={
          <div className="flex gap-2">
            {a.status === 'pending_approval' && (
              <Button variant="primary" onClick={doApprove} loading={approve.isPending}>Approve</Button>
            )}
            {a.status === 'draft' && (
              <Button variant="primary" onClick={() => setConfirmPost(true)}>Post</Button>
            )}
            {(a.status === 'draft' || a.status === 'pending_approval') && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel</Button>
            )}
            <Link to="/inventory/adjustments"><Button variant="secondary">Back</Button></Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lines</h3>
            <div className="text-sm">
              Net value Δ:&nbsp;
              <span className="font-mono font-semibold" style={{ color: delta < 0 ? '#b91c1c' : delta > 0 ? '#15803d' : undefined }}>
                {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}₹${Math.abs(delta).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Item</Th>
                <Th>Batch</Th>
                <Th className="text-right">Qty Δ</Th>
                <Th className="text-right">Unit cost</Th>
                <Th className="text-right">Value Δ</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.lines.map((l) => {
                const q = Number(l.qtyDelta);
                const v = Number(l.valueDelta);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.itemName}</TableCell>
                    <TableCell className="font-mono text-xs">{l.batchNo ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums" style={{ color: q < 0 ? '#b91c1c' : '#15803d' }}>
                      {q > 0 ? '+' : ''}{q.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">₹{Number(l.unitCost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right tabular-nums" style={{ color: v < 0 ? '#b91c1c' : v > 0 ? '#15803d' : undefined }}>
                      {v === 0 ? '—' : `${v > 0 ? '+' : ''}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {a.notes && (
        <Card className="mt-4">
          <CardHeader><h3 className="text-sm font-semibold">Notes</h3></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm">{a.notes}</p></CardContent>
        </Card>
      )}

      {a.journalEntryId && (
        <p className="mt-4 text-xs text-zinc-500">Linked JE: <span className="font-mono">{a.journalEntryId}</span></p>
      )}

      <ConfirmationDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={doPost}
        title="Post this adjustment?"
        description="Stock will be updated and a journal entry will be created (write-off / gain account)."
        confirmLabel="Post"
        variant="warning"
        loading={post.isPending}
      />

      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold">Cancel adjustment?</h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Only draft / pending-approval adjustments can be cancelled. To reverse a posted one, create a counter-adjustment.
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

function StatusBadge({ status }: { status: 'draft' | 'pending_approval' | 'posted' | 'cancelled' }) {
  const m = {
    draft: ['default', 'Draft'],
    pending_approval: ['warning', 'Pending approval'],
    posted: ['success', 'Posted'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}

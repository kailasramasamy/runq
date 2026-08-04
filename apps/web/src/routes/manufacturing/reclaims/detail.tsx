import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, useToast, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Input,
} from '@/components/ui';
import { useReclaim, usePostReclaim, useCancelReclaim } from '@/hooks/queries/use-reclaims';

export function ReclaimDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { toast } = useToast();
  const { data: r, isLoading } = useReclaim(id);
  const post = usePostReclaim();
  const cancel = useCancelReclaim();

  const [confirmPost, setConfirmPost] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading || !r) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  async function doPost() {
    try {
      const res = await post.mutateAsync(id);
      setConfirmPost(false);
      if (res.warnings.length > 0) {
        toast(`Posted — ${res.warnings.join(' · ')}`, 'info');
      } else {
        toast('Posted — stock moved and loss written off', 'success');
      }
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

  const loss = Number(r.lossValue);

  return (
    <div>
      <PageHeader
        title={r.reclaimNo}
        titleBadge={<StatusBadge status={r.status} />}
        description={`${r.reclaimDate} · ${r.warehouseName}`}
        actions={
          <div className="flex gap-2">
            {r.status === 'draft' && (
              <>
                <Button variant="primary" onClick={() => setConfirmPost(true)}>Post</Button>
                <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel</Button>
              </>
            )}
            <Link to="/manufacturing/reclaims"><Button variant="secondary">Back</Button></Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Lines</h3>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Metric label="FG opened" value={Number(r.fgValue)} />
              <Metric label="Recovered" value={Number(r.recoveredValue)} tone="success" />
              <Metric label="Written off" value={loss} tone={loss > 0 ? 'danger' : undefined} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Finished good</Th>
                <Th>FG batch</Th>
                <Th className="text-right">FG qty</Th>
                <Th className="text-right">FG value</Th>
                <Th>Recovered as</Th>
                <Th>New batch</Th>
                <Th className="text-right">Recovered qty</Th>
                <Th>Expiry</Th>
                <Th className="text-right">Recovered value</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.fgItemName}</TableCell>
                  <TableCell className="font-mono text-xs">{l.fgBatchNo ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtQty(l.fgQty)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(Number(l.fgValue))}</TableCell>
                  <TableCell className="font-medium">{l.recoveredItemName}</TableCell>
                  <TableCell className="font-mono text-xs">{l.recoveredBatchNo ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtQty(l.recoveredQty)}{l.recoveredUom ? ` ${l.recoveredUom}` : ''}
                  </TableCell>
                  <TableCell className="text-xs">{l.expiryDate ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(Number(l.recoveredValue))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {r.notes && (
        <Card className="mt-4">
          <CardHeader><h3 className="text-sm font-semibold">Notes</h3></CardHeader>
          <CardContent><p className="whitespace-pre-line text-sm">{r.notes}</p></CardContent>
        </Card>
      )}

      {r.journalEntryId && (
        <p className="mt-4 text-xs text-zinc-500">Linked JE: <span className="font-mono">{r.journalEntryId}</span></p>
      )}

      <ConfirmationDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={doPost}
        title="Post this reclaim?"
        description="The finished goods come out of stock and the recovered material goes in at raw-material cost. The difference is written off."
        confirmLabel="Post"
        variant="warning"
        loading={post.isPending}
      />

      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold">Cancel reclaim?</h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Only drafts can be cancelled. To undo a posted reclaim, record a counter-reclaim.
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

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  const color = tone === 'danger' ? '#b91c1c' : tone === 'success' ? '#15803d' : undefined;
  return (
    <span className="text-zinc-500 dark:text-zinc-400">
      {label}:&nbsp;
      <span className="font-mono font-semibold" style={{ color }}>{fmtMoney(value)}</span>
    </span>
  );
}

function fmtMoney(n: number) {
  return n === 0 ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function fmtQty(v: string) {
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function StatusBadge({ status }: { status: 'draft' | 'posted' | 'cancelled' }) {
  const m = {
    draft: ['default', 'Draft'],
    posted: ['success', 'Posted'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}

import { useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, useToast, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Input,
} from '@/components/ui';
import {
  useStockTake, useUpdateCountLine, usePostStockTake, useCancelStockTake,
} from '@/hooks/queries/use-inventory';

export function StockTakeDetailPage() {
  const { id } = useParams({ from: '/inventory/stock-take/$id' as never }) as { id: string };
  const { toast } = useToast();
  const { data: st, isLoading } = useStockTake(id);
  const updateLine = useUpdateCountLine();
  const post = usePostStockTake();
  const cancel = useCancelStockTake();

  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (isLoading || !st) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;

  async function saveLine(lineId: string, value: string) {
    const n = Number(value);
    if (Number.isNaN(n) || n < 0) return;
    try {
      await updateLine.mutateAsync({ id, lineId, countedQty: n });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  }

  async function doPost() {
    try {
      await post.mutateAsync(id);
      toast('Posted — variance adjustment + JE created', 'success');
      setConfirmPost(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }
  async function doCancel() {
    try {
      await cancel.mutateAsync(id);
      toast('Cancelled', 'success');
      setConfirmCancel(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  const counted = st.lines.filter((l) => l.countedQty != null).length;
  const total = st.lines.length;
  const varianceLines = st.lines.filter((l) => l.variance != null && l.variance !== 0);
  const totalVarianceValue = varianceLines.reduce(
    (s, l) => s + (l.variance ?? 0) * Number(l.unitCost),
    0,
  );

  return (
    <div>
      <PageHeader
        title={st.stNo}
        titleBadge={<StatusBadge status={st.status} />}
        description={`${st.warehouseName} · ${st.scope}${st.frozen ? ' · frozen' : ''} · ${counted}/${total} counted`}
        actions={
          <div className="flex gap-2">
            {st.status === 'in_progress' && (
              <Button variant="primary" onClick={() => setConfirmPost(true)}>Post</Button>
            )}
            {st.status === 'in_progress' && (
              <Button variant="destructive" onClick={() => setConfirmCancel(true)}>Cancel</Button>
            )}
            <Link to="/inventory/stock-take"><Button variant="secondary">Back</Button></Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Count sheet</h3>
            <div className="flex gap-6 text-sm">
              <div><span className="text-zinc-500">Lines with variance:</span> <strong>{varianceLines.length}</strong></div>
              <div>
                <span className="text-zinc-500">Net variance value:</span>{' '}
                <strong
                  className="font-mono"
                  style={{ color: totalVarianceValue < 0 ? '#b91c1c' : totalVarianceValue > 0 ? '#15803d' : undefined }}
                >
                  {totalVarianceValue === 0 ? '—' : `${totalVarianceValue > 0 ? '+' : ''}₹${Math.abs(totalVarianceValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                </strong>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Item</Th>
                <Th>Batch</Th>
                <Th className="text-right">System</Th>
                <Th className="text-right">Counted</Th>
                <Th className="text-right">Variance</Th>
                <Th className="text-right">Unit cost</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {st.lines.map((l) => {
                const variance = l.variance;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.itemName}</TableCell>
                    <TableCell className="font-mono text-xs">{l.batchNo ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.systemQty).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {st.status === 'in_progress' ? (
                        <Input
                          type="number" step="0.001" min="0" className="w-28 text-right"
                          defaultValue={l.countedQty ?? ''}
                          onBlur={(e) => saveLine(l.id, e.target.value)}
                        />
                      ) : (
                        l.countedQty ?? '—'
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      style={{ color: variance == null ? undefined : variance < 0 ? '#b91c1c' : variance > 0 ? '#15803d' : undefined }}
                    >
                      {variance == null ? '—' : `${variance > 0 ? '+' : ''}${variance.toLocaleString('en-IN', { maximumFractionDigits: 3 })}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">₹{Number(l.unitCost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {st.status === 'in_progress' && (
            <p className="mt-3 text-xs text-zinc-500">
              Counts save on blur. Leave blank to skip the row (no variance assumed).
            </p>
          )}
        </CardContent>
      </Card>

      {st.adjustmentId && (
        <p className="mt-4 text-xs text-zinc-500">
          Variance adjustment:{' '}
          <Link to="/inventory/adjustments/$id" params={{ id: st.adjustmentId }} className="font-mono hover:underline" style={{ color: 'var(--accent-text)' }}>
            {st.adjustmentId}
          </Link>
        </p>
      )}

      <ConfirmationDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={doPost}
        title="Post stock take?"
        description="A consolidated adjustment + JE will be created for all variance lines. Uncounted lines are treated as zero variance."
        confirmLabel="Post"
        variant="warning"
        loading={post.isPending}
      />
      <ConfirmationDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={doCancel}
        title="Cancel stock take?"
        description="The snapshot is discarded. You'll need to start a new session to count again."
        confirmLabel="Cancel session"
        variant="danger"
        loading={cancel.isPending}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: 'in_progress' | 'reviewed' | 'posted' | 'cancelled' }) {
  const m = {
    in_progress: ['info', 'In progress'],
    reviewed: ['warning', 'Reviewed'],
    posted: ['success', 'Posted'],
    cancelled: ['danger', 'Cancelled'],
  } as const;
  const [v, t] = m[status];
  return <Badge variant={v}>{t}</Badge>;
}

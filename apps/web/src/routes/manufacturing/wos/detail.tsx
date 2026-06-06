import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Pencil, XCircle, Play, Lock, Trash2 } from 'lucide-react';
import {
  PageHeader, Button, Card, CardHeader, CardContent, CardSkeleton,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  ConfirmationDialog, useToast,
} from '@/components/ui';
import { useWorkOrder, useCancelWorkOrder, useDeleteWorkOrder } from '@/hooks/queries/use-work-orders';
import { useWoConsumption, useWoOutput, useStartWo, useCloseWo, useWoCostingPreview } from '@/hooks/queries/use-wo-run';
import { RunCloseDialog } from './_run-close-dialog';
import { formatINR } from '@/lib/utils';
import type { WorkOrderExpectedLine } from '@runq/types';

const ACCENT = '#E11D48';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', in_progress: 'In Progress', completed: 'Completed',
  closed: 'Closed', cancelled: 'Cancelled',
};
const STATUS_BG: Record<string, string> = {
  draft: 'var(--surface-2)',
  in_progress: 'rgba(217, 119, 6, 0.12)',
  completed: 'rgba(37, 99, 235, 0.10)',
  closed: 'rgba(22, 163, 74, 0.10)',
  cancelled: 'rgba(220, 38, 38, 0.08)',
};
const STATUS_FG: Record<string, string> = {
  draft: 'var(--text-2)',
  in_progress: '#d97706',
  completed: '#2563eb',
  closed: '#16a34a',
  cancelled: '#dc2626',
};

interface Props { woId: string }

export function WorkOrderDetailPage({ woId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = useWorkOrder(woId);
  const cancelM = useCancelWorkOrder();
  const deleteM = useDeleteWorkOrder();
  const startM = useStartWo();
  const closeM = useCloseWo();
  const [showCancel, setShowCancel] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const wo = data?.data;
  const showRunLink = wo?.status === 'in_progress' || wo?.status === 'completed';
  const canStart = wo?.status === 'draft';
  const canClose = wo?.status === 'completed';

  // Costing preview powers the close dialog (qty + variance summary).
  const { data: previewRes } = useWoCostingPreview(woId);
  const preview = previewRes?.data ?? null;

  async function handleStartRun() {
    if (!wo) return;
    try {
      await startM.mutateAsync(woId);
      navigate({ to: '/manufacturing/wos/$woId/run', params: { woId } });
    } catch (e) {
      toast(`Could not start WO: ${(e as Error).message}`, 'error');
    }
  }

  function handleClose(varianceAcknowledged: boolean) {
    closeM.mutate(
      { woId, data: { varianceAcknowledged } },
      {
        onSuccess: () => {
          toast('Work order closed', 'success');
          setShowClose(false);
        },
        onError: (e) => toast((e as Error).message || 'Failed to close', 'error'),
      },
    );
  }

  // Fetch actuals for closed WOs and enriched detail view
  const { data: consumptionRes } = useWoConsumption(woId);
  const { data: outputRes } = useWoOutput(woId);
  const consumptions = consumptionRes?.data ?? [];
  const outputs = outputRes?.data ?? [];

  if (isLoading) {
    return (
      <div className="max-w-5xl space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  if (isError || !wo) {
    return <p className="text-sm text-red-500">Work order not found.</p>;
  }

  const canEdit = wo.status === 'draft';
  const canCancel = wo.status === 'draft' || wo.status === 'in_progress';
  // Delete is intentionally draft-only — anything past draft has stock
  // ledger / cost side-effects the API refuses to drop. Use Cancel for those.
  const canDelete = wo.status === 'draft';

  const tone = { bg: STATUS_BG[wo.status] ?? 'var(--surface-2)', fg: STATUS_FG[wo.status] ?? 'var(--text-2)' };

  function handleCancel() {
    cancelM.mutate(
      { id: woId, data: { reason: null } },
      {
        onSuccess: () => { toast('Work order cancelled', 'success'); setShowCancel(false); },
        onError: (e) => toast((e as Error).message || 'Failed to cancel', 'error'),
      },
    );
  }

  function handleDelete() {
    deleteM.mutate(woId, {
      onSuccess: () => {
        toast('Work order deleted', 'success');
        setShowDelete(false);
        navigate({ to: '/manufacturing/wos' });
      },
      onError: (e) => toast((e as Error).message || 'Failed to delete', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Work Orders', href: '/manufacturing/wos' },
          { label: wo.woNumber },
        ]}
        title={wo.woNumber}
        titleBadge={
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {STATUS_LABEL[wo.status] ?? wo.status}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canStart && (
              <Button
                size="sm"
                onClick={handleStartRun}
                disabled={startM.isPending}
                style={{ background: ACCENT, borderColor: ACCENT }}
              >
                <Play size={13} className="mr-1" />
                {startM.isPending ? 'Starting…' : 'Start Run'}
              </Button>
            )}
            {canClose && (
              <Button
                size="sm"
                onClick={() => setShowClose(true)}
                style={{ background: ACCENT, borderColor: ACCENT }}
              >
                <Lock size={13} className="mr-1" /> Close Work Order
              </Button>
            )}
            {showRunLink && (
              <Button
                size="sm"
                onClick={() => navigate({ to: '/manufacturing/wos/$woId/run', params: { woId } })}
                style={{ background: ACCENT, borderColor: ACCENT }}
              >
                <Play size={13} className="mr-1" /> Open Run View
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline" size="sm"
                onClick={() => navigate({ to: '/manufacturing/wos/$woId/edit', params: { woId } })}
              >
                <Pencil size={13} className="mr-1" /> Edit
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => setShowCancel(true)}>
                <XCircle size={13} className="mr-1" /> Cancel
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline" size="sm"
                onClick={() => setShowDelete(true)}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
              >
                <Trash2 size={13} className="mr-1" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Header card */}
          <Card>
            <CardHeader title="Work order header" />
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <dt style={{ color: 'var(--text-3)' }}>BOM</dt>
                <dd className="font-medium">{wo.bomCode} — {wo.bomName}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Output item</dt>
                <dd>{wo.outputItemName}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Planned qty</dt>
                <dd className="font-mono">{wo.plannedQty} {wo.outputUom}</dd>
                <dt style={{ color: 'var(--text-3)' }}>BOM version</dt>
                <dd>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono dark:bg-zinc-800">
                    v{wo.bomVersion}
                  </span>
                </dd>
                <dt style={{ color: 'var(--text-3)' }}>Scheduled date</dt>
                <dd>{wo.scheduledFor}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Shift</dt>
                <dd>{wo.shift ?? '—'}</dd>
                <dt style={{ color: 'var(--text-3)' }}>Warehouse</dt>
                <dd>{wo.warehouseName}</dd>
                {wo.startedAt && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Started at</dt>
                    <dd>{new Date(wo.startedAt).toLocaleString('en-IN')}</dd>
                  </>
                )}
                {wo.completedAt && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Completed at</dt>
                    <dd>{new Date(wo.completedAt).toLocaleString('en-IN')}</dd>
                  </>
                )}
                {wo.closedAt && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Closed at</dt>
                    <dd>{new Date(wo.closedAt).toLocaleString('en-IN')}</dd>
                  </>
                )}
                {wo.cancelledAt && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Cancelled at</dt>
                    <dd>{new Date(wo.cancelledAt).toLocaleString('en-IN')}</dd>
                  </>
                )}
                {wo.cancelledReason && (
                  <>
                    <dt style={{ color: 'var(--text-3)' }}>Cancellation reason</dt>
                    <dd className="whitespace-pre-line">{wo.cancelledReason}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Expected vs Actual table */}
          <Card>
            <CardHeader title="Expected vs actual inputs" />
            <CardContent className="p-0">
              {wo.expected.length === 0 ? (
                <p className="px-4 py-4 text-[12px]" style={{ color: 'var(--text-3)' }}>
                  No input lines defined on BOM.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <tr>
                      <Th>Input item</Th>
                      <Th align="right">Expected qty</Th>
                      <Th>UOM</Th>
                      <Th align="right">Scrap %</Th>
                      <Th align="right">Actual qty</Th>
                      <Th>Optional</Th>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {wo.expected.map((line: WorkOrderExpectedLine) => {
                      const actualQty = consumptions
                        .filter((c) => c.bomLineId === line.bomLineId)
                        .reduce((s, c) => s + c.qty, 0);
                      const hasActuals = wo.status !== 'draft';
                      return (
                        <TableRow key={line.bomLineId}>
                          <TableCell>{line.inputItemName}</TableCell>
                          <TableCell align="right" numeric>{line.expectedQty.toFixed(4)}</TableCell>
                          <TableCell>{line.inputUom}</TableCell>
                          <TableCell align="right" numeric>{line.scrapPct}%</TableCell>
                          <TableCell align="right" numeric>
                            {hasActuals ? (
                              <span
                                style={{
                                  color: actualQty > line.expectedQty * 1.05
                                    ? '#d97706'
                                    : 'var(--text-1)',
                                }}
                              >
                                {actualQty.toFixed(4)}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-3)' }}>—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.isOptional ? (
                              <span className="text-[11px] text-amber-600">Optional</span>
                            ) : (
                              <span style={{ color: 'var(--text-3)' }}>—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Costing sidebar */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Costing" />
            <CardContent>
              <div className="space-y-2 text-[13px]">
                <CostRow label="Planned qty" value={`${wo.plannedQty} ${wo.outputUom}`} />
                <CostRow
                  label="Output qty"
                  value={`${wo.outputQty} ${wo.outputUom}`}
                  muted={wo.outputQty === 0}
                />
                <CostRow
                  label="Consumed value"
                  value={wo.consumedValue > 0 ? formatINR(wo.consumedValue) : '—'}
                  muted={wo.consumedValue === 0}
                />
                <CostRow
                  label="Output value"
                  value={wo.outputValue > 0 ? formatINR(wo.outputValue) : '—'}
                  muted={wo.outputValue === 0}
                />
                <CostRow
                  label="Yield variance"
                  value={
                    wo.status === 'closed'
                      ? `${wo.yieldVariance >= 0 ? '+' : ''}${wo.yieldVariance.toFixed(3)} ${wo.outputUom}`
                      : '—'
                  }
                  muted={wo.status !== 'closed'}
                />
              </div>
              {wo.status === 'closed' && (
                <div className="mt-3 space-y-2">
                  <div className="rounded border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Finished goods landed in stock</p>
                    <Link
                      to="/inventory/stock/on-hand"
                      search={{ q: wo.outputItemName }}
                      className="text-[11px] font-medium underline"
                      style={{ color: ACCENT }}
                    >
                      View {wo.outputItemName} in inventory →
                    </Link>
                  </div>
                  {wo.jeId && (
                    <div className="rounded border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                      <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Journal entry posted</p>
                      <Link
                        to="/finance/gl/journal-entries/$journalEntryId"
                        params={{ journalEntryId: wo.jeId }}
                        className="text-[11px] font-medium underline"
                        style={{ color: ACCENT }}
                      >
                        View JE →
                      </Link>
                    </div>
                  )}
                </div>
              )}
              {wo.status !== 'closed' && wo.status !== 'draft' && (
                <p
                  className="mt-3 rounded border px-3 py-2 text-[11px]"
                  style={{
                    background: 'var(--surface-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-3)',
                  }}
                >
                  Output value + yield variance are set at WO close.
                </p>
              )}
              {wo.status === 'draft' && (
                <p
                  className="mt-3 rounded border px-3 py-2 text-[11px]"
                  style={{
                    background: 'var(--surface-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-3)',
                  }}
                >
                  Start the run to begin recording consumption and output.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Output batches summary for closed WOs */}
          {wo.status === 'closed' && outputs.length > 0 && (
            <Card>
              <CardHeader title="Output batches" />
              <CardContent>
                <div className="space-y-1">
                  {outputs.map((o) => (
                    <Link
                      key={o.id}
                      to="/inventory/stock/on-hand"
                      search={{ q: o.batchNo }}
                      className="flex justify-between rounded px-2 py-1 text-[12px] -mx-2 hover:bg-[color:var(--surface-2)]"
                      title="View this batch in inventory on-hand"
                    >
                      <span style={{ color: 'var(--text-2)' }}>
                        {o.batchNo}
                        {o.expiryDate ? ` · exp ${o.expiryDate}` : ''}
                      </span>
                      <span className="font-mono tabular-nums" style={{ color: 'var(--text-1)' }}>
                        {o.qty.toFixed(3)} {o.uom}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this work order?"
        description="The work order will be marked cancelled. No stock transactions exist yet (Phase 1), so no reversals are needed."
        confirmLabel="Cancel WO"
        loading={cancelM.isPending}
      />
      <ConfirmationDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete this work order permanently?"
        description="The WO row will be removed. Only draft work orders can be deleted — anything past draft must be cancelled instead, so stock movements get reversed cleanly."
        confirmLabel="Delete"
        loading={deleteM.isPending}
      />
      <RunCloseDialog
        open={showClose}
        onClose={() => setShowClose(false)}
        onConfirm={handleClose}
        preview={preview}
        outputUom={wo.outputUom}
        isLoading={closeM.isPending}
      />
    </div>
  );
}

function CostRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span
        className="font-mono tabular-nums"
        style={{ color: muted ? 'var(--text-3)' : 'var(--text-1)' }}
      >
        {value}
      </span>
    </div>
  );
}

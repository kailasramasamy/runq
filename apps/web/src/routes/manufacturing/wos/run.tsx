/**
 * WO Run view — /manufacturing/wos/:id/run
 * The live production execution surface: consume inputs, record outputs,
 * drive WO lifecycle (Start / Complete / Close), live costing preview.
 * Spec: docs/manufacturing-plan.md §6, §8, §9, §10.2.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Lock, PlayCircle, CheckCircle2, X } from 'lucide-react';
import { PageHeader, Button, CardSkeleton, useToast } from '@/components/ui';
import { useWorkOrder } from '@/hooks/queries/use-work-orders';
import {
  useStartWo,
  useCompleteWo,
  useCloseWo,
  useWoCostingPreview,
} from '@/hooks/queries/use-wo-run';
import { RunInputsPanel } from './_run-inputs';
import { RunOutputsPanel } from './_run-outputs';
import { RunCostingStrip } from './_run-costing-strip';
import { RunCloseDialog } from './_run-close-dialog';

const ACCENT = '#E11D48';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
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

export function WorkOrderRunPage({ woId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, isError } = useWorkOrder(woId);
  const { data: previewRes, isLoading: previewLoading } = useWoCostingPreview(woId);
  const startM = useStartWo();
  const completeM = useCompleteWo();
  const closeM = useCloseWo();
  const [showClose, setShowClose] = useState(false);

  const wo = data?.data;
  const preview = previewRes?.data;

  // ─── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-7xl space-y-4 pb-20">
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !wo) {
    return <p className="text-sm text-red-500">Work order not found.</p>;
  }

  // ─── Lifecycle helpers ──────────────────────────────────────────────────────

  const isLocked = wo.status === 'closed' || wo.status === 'cancelled';

  function handleStart() {
    startM.mutate(woId, {
      onSuccess: () => toast('Work order started', 'success'),
      onError: (e) => toast((e as Error).message || 'Failed to start', 'error'),
    });
  }

  function handleComplete() {
    completeM.mutate(woId, {
      onSuccess: () => toast('Work order marked complete', 'success'),
      onError: (e) => toast((e as Error).message || 'Failed to complete', 'error'),
    });
  }

  function handleClose(varianceAcknowledged: boolean) {
    closeM.mutate(
      { woId, data: { varianceAcknowledged } },
      {
        onSuccess: () => {
          toast('Work order closed — JE posted', 'success');
          setShowClose(false);
          navigate({ to: '/manufacturing/wos/$woId', params: { woId } });
        },
        onError: (e) => toast((e as Error).message || 'Failed to close', 'error'),
      },
    );
  }

  // ─── Primary action button ──────────────────────────────────────────────────

  function PrimaryAction() {
    if (isLocked) return null;

    if (wo!.status === 'draft') {
      return (
        <Button
          onClick={handleStart}
          loading={startM.isPending}
          style={{ background: ACCENT, borderColor: ACCENT }}
        >
          <PlayCircle size={14} className="mr-1.5" />
          Start Run
        </Button>
      );
    }

    if (wo!.status === 'in_progress') {
      const hasOutput = (preview?.actualOutputQty ?? wo!.outputQty) > 0;
      return (
        <Button
          onClick={handleComplete}
          disabled={!hasOutput}
          loading={completeM.isPending}
          title={!hasOutput ? 'Record at least one output before marking complete' : undefined}
          style={hasOutput ? { background: '#2563eb', borderColor: '#2563eb' } : undefined}
        >
          <CheckCircle2 size={14} className="mr-1.5" />
          Mark Complete
        </Button>
      );
    }

    if (wo!.status === 'completed') {
      return (
        <Button
          onClick={() => setShowClose(true)}
          style={{ background: ACCENT, borderColor: ACCENT }}
        >
          <Lock size={14} className="mr-1.5" />
          Close Work Order
        </Button>
      );
    }

    return null;
  }

  const tone = {
    bg: STATUS_BG[wo.status] ?? 'var(--surface-2)',
    fg: STATUS_FG[wo.status] ?? 'var(--text-2)',
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* Leave enough space for sticky bottom strip */}
      <div className="flex-1 pb-20">
        <PageHeader
          breadcrumbs={[
            { label: 'Manufacturing', href: '/manufacturing' },
            { label: 'Work Orders', href: '/manufacturing/wos' },
            { label: wo.woNumber, href: `/manufacturing/wos/${woId}` },
            { label: 'Run' },
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
            <div className="flex items-center gap-2">
              <PrimaryAction />
            </div>
          }
        />

        {/* WO header strip */}
        <div
          className="mb-4 rounded-lg border px-4 py-3"
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-4">
            <dt style={{ color: 'var(--text-3)' }}>BOM</dt>
            <dd className="font-medium">{wo.bomCode} — {wo.bomName}</dd>
            <dt style={{ color: 'var(--text-3)' }}>Planned qty</dt>
            <dd className="font-mono">{wo.plannedQty} {wo.outputUom}</dd>
            <dt style={{ color: 'var(--text-3)' }}>Scheduled</dt>
            <dd>{wo.scheduledFor}</dd>
            <dt style={{ color: 'var(--text-3)' }}>Shift</dt>
            <dd>{wo.shift ?? '—'}</dd>
            <dt style={{ color: 'var(--text-3)' }}>Warehouse</dt>
            <dd>{wo.warehouseName}</dd>
          </dl>
        </div>

        {/* Locked banner */}
        {isLocked && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-[13px]"
            style={{
              background: 'rgba(220,38,38,0.06)',
              borderColor: 'rgba(220,38,38,0.25)',
              color: '#dc2626',
            }}
          >
            <Lock size={14} className="shrink-0" />
            This work order is{' '}
            <strong>{STATUS_LABEL[wo.status]?.toLowerCase()}</strong> — no further
            changes can be made.
          </div>
        )}

        {/* Cancelled + in-progress / completed banner for draft context */}
        {wo.status === 'draft' && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-[13px]"
            style={{
              background: 'rgba(217,119,6,0.07)',
              borderColor: 'rgba(217,119,6,0.28)',
              color: '#d97706',
            }}
          >
            <PlayCircle size={14} className="shrink-0" />
            Start the run to begin recording consumption and output.
          </div>
        )}

        {/* Two-column body */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RunInputsPanel
            woId={woId}
            warehouseId={wo.warehouseId}
            expected={wo.expected}
            status={wo.status}
          />
          <RunOutputsPanel
            woId={woId}
            warehouseId={wo.warehouseId}
            outputItemId={wo.outputItemId}
            outputUom={wo.outputUom}
            bomCode={wo.bomCode}
            status={wo.status}
          />
        </div>
      </div>

      {/* Sticky bottom costing strip */}
      <RunCostingStrip
        preview={preview}
        isLoading={previewLoading}
        outputUom={wo.outputUom}
      />

      {/* Close dialog */}
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

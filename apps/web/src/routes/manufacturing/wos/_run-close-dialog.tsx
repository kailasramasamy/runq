/**
 * Close Work Order confirmation dialog.
 * Shows costing summary, high-variance warning, and requires acknowledgement
 * if variance > 20% of expected.
 * Spec: docs/manufacturing-plan.md §9 row 13, §10.2.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { WoCostingPreview } from '@runq/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (varianceAcknowledged: boolean) => void;
  preview: WoCostingPreview | null | undefined;
  outputUom: string;
  isLoading: boolean;
}

export function RunCloseDialog({ open, onClose, onConfirm, preview, outputUom, isLoading }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  const expectedQty = preview?.expectedOutputQty ?? 0;
  const varianceQty = preview?.varianceQty ?? 0;
  const variancePct = expectedQty > 0 ? Math.abs(varianceQty / expectedQty) * 100 : 0;
  const isHighVariance = variancePct > 20;

  const canClose = !isHighVariance || acknowledged;
  const isPositive = varianceQty >= 0;

  function handleConfirm() {
    onConfirm(acknowledged);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close work order"
      size="sm"
    >
      <div className="space-y-4">
        {/* Costing summary */}
        <div
          className="rounded-lg border p-4 space-y-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Costing summary
          </p>
          <SummaryRow label="Consumed value" value={formatINR(preview?.consumedValue ?? 0)} />
          <SummaryRow
            label="Actual output"
            value={`${(preview?.actualOutputQty ?? 0).toFixed(3)} ${outputUom}`}
          />
          <SummaryRow
            label="Expected output"
            value={`${(preview?.expectedOutputQty ?? 0).toFixed(3)} ${outputUom}`}
          />
          <SummaryRow
            label="Per-unit output cost"
            value={formatINR(preview?.perUnitOutputCost ?? 0)}
          />
          <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <SummaryRow
              label="Variance qty"
              value={`${isPositive ? '+' : ''}${varianceQty.toFixed(3)} ${outputUom}`}
              tone={varianceQty === 0 ? 'neutral' : isPositive ? 'green' : 'amber'}
            />
            <SummaryRow
              label="Variance value (reporting only)"
              value={`${isPositive ? '+' : ''}${formatINR(preview?.varianceValue ?? 0)}`}
              muted
            />
          </div>
        </div>

        {/* High-variance warning */}
        {isHighVariance && (
          <div
            className="flex items-start gap-3 rounded-lg border px-3 py-3"
            style={{
              background: 'rgba(217, 119, 6, 0.08)',
              borderColor: 'rgba(217, 119, 6, 0.30)',
            }}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">
                Yield variance is {variancePct.toFixed(1)}% — confirm to proceed?
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-amber-700 dark:text-amber-400">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-amber-600"
                />
                I&apos;ve reviewed the variance
              </label>
            </div>
          </div>
        )}

        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          Closing this work order will roll up input costs into output cost and post a journal entry.
          This action cannot be reversed in v1 — contact finance for correction JEs.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canClose}
            loading={isLoading}
            onClick={handleConfirm}
            style={canClose ? { background: '#E11D48', borderColor: '#E11D48' } : undefined}
          >
            Close WO
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SummaryRow({
  label,
  value,
  tone = 'neutral',
  muted,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'green' | 'amber';
  muted?: boolean;
}) {
  const color =
    tone === 'green'
      ? '#16a34a'
      : tone === 'amber'
        ? '#d97706'
        : muted
          ? 'var(--text-3)'
          : 'var(--text-1)';

  return (
    <div className="flex justify-between gap-4 text-[12px]">
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span className="font-mono tabular-nums font-medium" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

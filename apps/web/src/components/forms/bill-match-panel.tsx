// PP Phase 3 — bill-side 3-way match panel.
// Slots into the bill detail page. Suggests open POs for the bill's
// vendor, lets the user pick one + confirm the match (or override with
// reason when outside tolerance), then the bill's JE re-posts via the
// GRNI clearing path on the next bill-post (or on amend).

import { useState } from 'react';
import { Link2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button, Modal, useToast } from '@/components/ui';
import {
  useMatchPreview,
  useCommitMatch,
  type OpenPoSummary,
} from '@/hooks/queries/use-po-match';
import { formatINR } from '@/lib/utils';

interface Props { billId: string }

export function BillMatchPanel({ billId }: Props) {
  const { data: previewRes, isLoading } = useMatchPreview(billId);
  const preview = previewRes?.data;

  if (isLoading || !preview) return null;
  if (preview.openPos.length === 0 && !preview.matchedPoId) return null;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
            3-way match
          </h3>
          <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            {preview.matchedPoId
              ? `Matched · tolerance ±${preview.tolerancePct}%`
              : `${preview.openPos.length} open PO(s) for this vendor · tolerance ±${preview.tolerancePct}%`}
          </p>
        </div>
        <MatchStatusBadge status={preview.matchStatus} />
      </div>

      {preview.matchedPoId ? (
        <MatchedRow
          billId={billId}
          po={preview.openPos.find((p) => p.id === preview.matchedPoId) ?? null}
          delta={preview.amountDelta}
        />
      ) : (
        <div className="space-y-2">
          {preview.openPos.slice(0, 5).map((po) => (
            <SuggestionRow
              key={po.id}
              billId={billId}
              billTotal={preview.amountDelta?.billTotal ?? 0}
              po={po}
              tolerancePct={preview.tolerancePct}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchStatusBadge({ status }: { status: 'unmatched' | 'matched' | 'mismatch' }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    matched:   { bg: 'rgba(22, 163, 74, 0.10)', fg: '#16a34a', label: '✓ Matched' },
    mismatch:  { bg: 'rgba(234, 88, 12, 0.10)', fg: '#ea580c', label: 'Override' },
    unmatched: { bg: 'var(--surface-2)',         fg: 'var(--text-3)', label: 'Unmatched' },
  };
  const s = map[status] ?? map.unmatched!;
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function SuggestionRow({
  billId, billTotal, po, tolerancePct,
}: { billId: string; billTotal: number; po: OpenPoSummary; tolerancePct: number }) {
  const [showModal, setShowModal] = useState(false);
  const absDelta = Math.abs(billTotal - po.openValue);
  const pctDelta = po.openValue > 0 ? (absDelta / po.openValue) * 100 : 100;
  const withinTolerance = pctDelta <= tolerancePct;

  return (
    <>
      <div
        className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-[12.5px]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium" style={{ color: 'var(--text-1)' }}>
            <Link2 size={12} style={{ color: 'var(--text-3)' }} />
            <span className="num">{po.poNumber}</span>
            <span style={{ color: 'var(--text-3)' }}>· {po.poDate}</span>
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Open value: {formatINR(po.openValue)} · Bill: {formatINR(billTotal)} · Δ {formatINR(absDelta)} ({pctDelta.toFixed(1)}%)
          </div>
        </div>
        <Button size="sm" variant={withinTolerance ? 'primary' : 'outline'} onClick={() => setShowModal(true)}>
          {withinTolerance ? <CheckCircle2 size={13} className="mr-1" /> : <AlertTriangle size={13} className="mr-1" />}
          {withinTolerance ? 'Match' : 'Override & match'}
        </Button>
      </div>

      <CommitModal
        open={showModal}
        onClose={() => setShowModal(false)}
        billId={billId}
        po={po}
        billTotal={billTotal}
        tolerancePct={tolerancePct}
        absDelta={absDelta}
        pctDelta={pctDelta}
        withinTolerance={withinTolerance}
      />
    </>
  );
}

function MatchedRow({
  billId, po, delta,
}: {
  billId: string;
  po: OpenPoSummary | null;
  delta: MatchPreview['amountDelta'];
}) {
  if (!po) {
    return (
      <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
        Linked PO is closed or cancelled — match record preserved.
      </p>
    );
  }
  return (
    <div
      className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-[12.5px]"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium" style={{ color: 'var(--text-1)' }}>
          <Link2 size={12} style={{ color: 'var(--text-3)' }} />
          <a
            href={`/purchase/pos/${po.id}`}
            className="num underline-offset-2 hover:underline"
            style={{ color: 'var(--accent-text)' }}
          >
            {po.poNumber}
          </a>
          <span style={{ color: 'var(--text-3)' }}>· {po.poDate}</span>
        </div>
        {delta && (
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
            Bill {formatINR(delta.billTotal)} vs PO open {formatINR(delta.poOpen)} · Δ {formatINR(delta.absDelta)} ({delta.pctDelta.toFixed(1)}%)
          </div>
        )}
      </div>
    </div>
  );
}

function CommitModal({
  open, onClose, billId, po, billTotal, tolerancePct, absDelta, pctDelta, withinTolerance,
}: {
  open: boolean;
  onClose: () => void;
  billId: string;
  po: OpenPoSummary;
  billTotal: number;
  tolerancePct: number;
  absDelta: number;
  pctDelta: number;
  withinTolerance: boolean;
}) {
  const { toast } = useToast();
  const mutation = useCommitMatch();
  const [reason, setReason] = useState('');

  function handleSubmit() {
    if (!withinTolerance && !reason.trim()) {
      toast('An override reason is required for out-of-tolerance matches', 'error');
      return;
    }
    mutation.mutate(
      {
        billId,
        matchedPoId: po.id,
        overrideReason: withinTolerance ? null : reason.trim(),
      },
      {
        onSuccess: (res) => {
          const r = (res as { data?: { status?: string } })?.data;
          toast(
            r?.status === 'matched'
              ? `Matched to ${po.poNumber}`
              : `Override accepted (${pctDelta.toFixed(1)}% > ${tolerancePct}%)`,
            'success',
          );
          onClose();
        },
        onError: (err) => toast((err as Error).message || 'Failed to commit match', 'error'),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Match to ${po.poNumber}`}>
      <div className="space-y-3">
        <div
          className="rounded-md border px-3 py-2.5 text-[12.5px]"
          style={{
            borderColor: withinTolerance
              ? 'rgba(22, 163, 74, 0.3)'
              : 'rgba(234, 88, 12, 0.3)',
            background: withinTolerance
              ? 'rgba(22, 163, 74, 0.08)'
              : 'rgba(234, 88, 12, 0.08)',
          }}
        >
          <div className="font-medium" style={{ color: 'var(--text-1)' }}>
            Bill {formatINR(billTotal)} vs PO open {formatINR(po.openValue)}
          </div>
          <div className="mt-0.5" style={{ color: 'var(--text-2)' }}>
            Δ {formatINR(absDelta)} ({pctDelta.toFixed(2)}%) · tolerance ±{tolerancePct}%
          </div>
        </div>

        {!withinTolerance && (
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Override reason
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
              placeholder="Short-supply on PO; vendor invoiced extra freight; etc."
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={mutation.isPending}>
            {withinTolerance ? 'Match' : 'Override & match'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Re-import the type to keep the helper signatures local-typed.
import type { MatchPreview } from '@/hooks/queries/use-po-match';

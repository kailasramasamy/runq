import { Link } from '@tanstack/react-router';
import { Truck } from 'lucide-react';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ar/primitives';
import { useInvoiceDispatchStatus } from '@/hooks/queries/use-sales-dispatch';

/**
 * "Have the goods actually left?" on the AR invoice.
 *
 * Finance owns the money leg, Inventory owns the quantity leg — this strip is
 * the join, so an invoice that's been raised but never shipped is visible from
 * the side that raised it. Renders nothing for services-only invoices.
 */
export function DispatchStatusStrip({ invoiceId, status }: { invoiceId: string; status: string }) {
  const { data } = useInvoiceDispatchStatus(invoiceId);

  // Drafts owe nothing yet; services-only invoices never ship.
  if (!data || status === 'draft' || status === 'cancelled') return null;
  if (data.status === 'not_stockable') return null;

  const tone = TONES[data.status];
  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <Truck size={16} style={{ color: tone.fg }} className="shrink-0" />
      <div className="flex-1">
        <div className="text-[13px] font-medium" style={{ color: tone.fg }}>{tone.title}</div>
        <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
          {data.dispatchedLines} of {data.stockableLines} stockable line
          {data.stockableLines === 1 ? '' : 's'} fully dispatched.
          {data.deliveryNotes.length > 0 && ' '}
          {data.deliveryNotes.map((dn, i) => (
            <span key={dn.id}>
              {i > 0 && ', '}
              <Link
                to="/inventory/delivery/$id"
                params={{ id: dn.id }}
                className="hover:underline"
                style={{ color: 'var(--accent-text)' }}
              >
                {dn.dnNo}
              </Link>
              {dn.direction === 'in' && <Badge variant="warning">Return</Badge>}
            </span>
          ))}
        </div>
      </div>
      {data.status !== 'dispatched' && (
        <Link to="/inventory/delivery/from-invoice/$id" params={{ id: invoiceId }}>
          <Button size="sm" variant="outline" icon={<Truck size={13} />}>Dispatch goods</Button>
        </Link>
      )}
    </div>
  );
}

const TONES: Record<string, { bg: string; border: string; fg: string; title: string }> = {
  pending: {
    bg: 'var(--warn-soft, #fffbeb)',
    border: 'color-mix(in oklab, var(--warning-text, #f59e0b) 30%, transparent)',
    fg: 'var(--warning-text, #92400e)',
    title: 'Invoiced but not dispatched',
  },
  partial: {
    bg: 'var(--warn-soft, #fffbeb)',
    border: 'color-mix(in oklab, var(--warning-text, #f59e0b) 30%, transparent)',
    fg: 'var(--warning-text, #92400e)',
    title: 'Partially dispatched',
  },
  dispatched: {
    bg: 'var(--pos-soft, #f0fdf4)',
    border: 'color-mix(in oklab, var(--pos, #16a34a) 30%, transparent)',
    fg: 'var(--pos, #16a34a)',
    title: 'Goods dispatched',
  },
};

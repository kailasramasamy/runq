/**
 * Manual draw table for Record Production — one row per batch the line can
 * draw from, each with a qty box the operator fills in themselves.
 *
 * The boxes start empty on purpose. The server still computes a draw, but it
 * is offered behind the Suggest button rather than pre-filled: a number nobody
 * typed is how the books drift away from what is actually in the tank. Nothing
 * posts until the entered total matches what the recipe needs.
 *
 * Spec: docs/manufacturing-plan.md §5.4.
 */
import { AlertTriangle, PackageSearch, Wand2 } from 'lucide-react';
import { Card, CardHeader, CardContent, Input, Button, EmptyState, Skeleton } from '@/components/ui';
import { formatItemQty, formatINR } from '@/lib/utils';
import type { ProductionAllocation, InputPoolBatch, ProductionShortage } from '@runq/types';

/** Entered quantities, keyed by `itemId::batchNo` across every line. */
export type DrawDraft = Record<string, string>;

export function batchKey(itemId: string, batchNo: string | null): string {
  return `${itemId}::${batchNo ?? ''}`;
}

export function enteredQty(draft: DrawDraft, b: InputPoolBatch): number {
  const raw = draft[batchKey(b.itemId, b.batchNo)];
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : 0;
}

/** What the operator has committed to this line so far. */
export function drawnTotal(draft: DrawDraft, a: ProductionAllocation): number {
  return round3(a.pool.reduce((sum, b) => sum + enteredQty(draft, b), 0));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface Props {
  allocations: ProductionAllocation[];
  shortages: ProductionShortage[];
  draft: DrawDraft;
  isLoading: boolean;
  hasQuery: boolean;
  onQtyChange: (key: string, value: string) => void;
  onSuggest: (allocation: ProductionAllocation) => void;
}

export function ProductionLinesPanel({
  allocations, shortages, draft, isLoading, hasQuery, onQtyChange, onSuggest,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        What went in
      </p>

      {shortages.length > 0 && <ShortageBanner shortages={shortages} />}

      {!hasQuery ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing to draw from yet"
          description="Pick a BOM, produced qty, and warehouse to see what is available."
        />
      ) : isLoading ? (
        <Card><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
      ) : allocations.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No input lines" description="This BOM has no input lines." />
      ) : (
        allocations.map((a) => (
          <DrawCard
            key={a.bomLineId ?? a.inputItemId}
            allocation={a}
            draft={draft}
            onQtyChange={onQtyChange}
            onSuggest={() => onSuggest(a)}
          />
        ))
      )}
    </div>
  );
}

function ShortageBanner({ shortages }: { shortages: ProductionShortage[] }) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-[12.5px]"
      style={{ background: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.3)', color: '#dc2626' }}
    >
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <AlertTriangle size={14} /> Insufficient stock — cannot post
      </div>
      <ul className="list-disc space-y-0.5 pl-5">
        {shortages.map((s, i) => (
          <li key={`${s.inputItemId}-${i}`}>
            {s.inputItemName} — short {formatItemQty(s.shortQty, null, s.uom)} {s.uom}
            {' '}(need {formatItemQty(s.requiredQty, null, s.uom)}, have {formatItemQty(s.availableQty, null, s.uom)})
          </li>
        ))}
      </ul>
    </div>
  );
}

function DrawCard({
  allocation: a, draft, onQtyChange, onSuggest,
}: {
  allocation: ProductionAllocation;
  draft: DrawDraft;
  onQtyChange: Props['onQtyChange'];
  onSuggest: () => void;
}) {
  const drawn = drawnTotal(draft, a);
  const gap = round3(a.requiredQty - drawn);
  const matched = Math.abs(gap) < 0.0005;

  return (
    <Card>
      <CardHeader
        title={a.inputItemName}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onSuggest}>
            <Wand2 size={12} className="mr-1" /> Suggest
          </Button>
        }
      />
      <CardContent>
        {a.substitutes.length > 0 && (
          <p className="mb-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            or {a.substitutes.map((s) => s.itemName).join(' / ')}
          </p>
        )}

        <div className="mb-3 flex items-baseline justify-between text-[12.5px]">
          <span style={{ color: 'var(--text-3)' }}>
            Needs {formatItemQty(a.requiredQty, null, a.uom)} {a.uom}
          </span>
          <span
            className="font-semibold"
            style={{ color: matched ? '#15803d' : drawn > 0 ? '#b45309' : 'var(--text-3)' }}
          >
            {formatItemQty(drawn, null, a.uom)} {a.uom} entered
            {!matched && drawn > 0 && (gap > 0 ? ` — short ${formatItemQty(gap, null, a.uom)}` : ` — over ${formatItemQty(-gap, null, a.uom)}`)}
            {matched && ' ✓'}
          </span>
        </div>

        {a.pool.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>
            Nothing on hand.
          </p>
        ) : (
          <div className="space-y-2">
            {a.pool.map((b) => (
              <PoolRow
                key={batchKey(b.itemId, b.batchNo)}
                batch={b}
                uom={a.uom}
                showItem={b.itemId !== a.inputItemId}
                value={draft[batchKey(b.itemId, b.batchNo)] ?? ''}
                onChange={(v) => onQtyChange(batchKey(b.itemId, b.batchNo), v)}
              />
            ))}
          </div>
        )}

        <Consequence allocation={a} draft={draft} />
      </CardContent>
    </Card>
  );
}

function PoolRow({
  batch, uom, showItem, value, onChange,
}: {
  batch: InputPoolBatch;
  uom: string;
  /** True when the batch came from a substitute — say which, or the row lies. */
  showItem: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const entered = Number(value) || 0;
  const over = entered > batch.qty + 0.0005;

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5" style={{ background: 'var(--surface-2)' }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium">
          {showItem ? batch.itemName : (batch.batchNo ?? 'No batch')}
          {showItem && batch.batchNo && (
            <span className="ml-2 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
              {batch.batchNo}
            </span>
          )}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {formatItemQty(batch.qty, null, uom)} {uom} on hand ·{' '}
          {batch.expiryDate ? `exp ${batch.expiryDate}` : 'no expiry'} ·{' '}
          {formatINR(batch.unitCost)}/{uom}
        </p>
      </div>
      <div className="w-28 shrink-0">
        <Input
          type="number" min="0" step="0.001"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          error={over ? 'Over' : undefined}
        />
      </div>
    </div>
  );
}

/**
 * What the entered split leaves behind. The split itself is on screen already;
 * what changes a decision is the remnant — 3 L that expires tomorrow is a
 * reason to draw differently, 565 L of fresh stock is not.
 */
function Consequence({ allocation: a, draft }: { allocation: ProductionAllocation; draft: DrawDraft }) {
  const drawn = drawnTotal(draft, a);
  if (drawn <= 0) return null;

  const emptied = a.pool.filter((b) => enteredQty(draft, b) >= b.qty - 0.0005 && enteredQty(draft, b) > 0);
  const remnants = a.pool
    .map((b) => ({ b, left: round3(b.qty - enteredQty(draft, b)) }))
    .filter((r) => enteredQty(draft, r.b) > 0 && r.left > 0.0005);

  // Only stock the run actually opened counts as a remnant — untouched batches
  // were never part of this decision.
  const soonest = remnants
    .filter((r) => r.b.expiryDate)
    .sort((x, y) => (x.b.expiryDate! < y.b.expiryDate! ? -1 : 1))[0];

  return (
    <div className="mt-3 border-t pt-2 text-[11.5px]" style={{ borderColor: 'var(--border)' }}>
      {remnants.length === 0 ? (
        <span style={{ color: '#15803d' }}>
          Drains {emptied.length} {emptied.length === 1 ? 'batch' : 'batches'} — nothing left part-used.
        </span>
      ) : (
        <span style={{ color: remnants.length > 1 ? '#b45309' : 'var(--text-3)' }}>
          Leaves{' '}
          {remnants.map((r, i) => (
            <span key={batchKey(r.b.itemId, r.b.batchNo)}>
              {i > 0 && ', '}
              <span className="font-medium">{formatItemQty(r.left, null, a.uom)} {a.uom}</span> {r.b.itemName}
            </span>
          ))}
          {soonest && ` — expires ${soonest.b.expiryDate}`}
          {remnants.length > 1 && ` (${remnants.length} part-used batches)`}
        </span>
      )}
    </div>
  );
}

import { useState } from 'react';
import { AlertTriangle, PackageOpen } from 'lucide-react';
import {
  Modal, Button, Combobox, Badge, Table, TableHeader, TableBody, TableRow, TableCell, Th, EmptyState,
} from '@/components/ui';
import { useZeroOutPreview, type PoolBucket, type ZeroOutLine } from '@/hooks/queries/use-inventory';

const CLASS_OPTIONS = [
  { value: '', label: 'All classes' },
  { value: 'raw_material', label: 'Raw material' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'semi_finished', label: 'Semi-finished' },
  { value: 'finished_good', label: 'Finished good' },
  { value: 'trading_good', label: 'Trading good' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'spare_part', label: 'Spare part' },
];

const BUCKET_LABEL: Record<PoolBucket, string> = {
  uncapitalised: 'Not on the GL',
  capitalised: 'On the GL',
  mixed: 'Mixed — needs a manual call',
};

const BUCKET_HELP: Record<PoolBucket, string> = {
  uncapitalised:
    'Milk-procurement receipts. The ledger carries a cost but inventory was never debited — '
    + 'the milk is already expensed at cycle lock. Loads with the journal entry switched off, '
    + 'so writing it off will not expense the milk twice.',
  capitalised:
    'Goods receipts, reclaims and production output. Inventory was debited when this stock '
    + 'arrived, so writing it off posts the matching journal entry.',
  mixed:
    'One batch fed by both sources. A single adjustment cannot be half on the GL, so split '
    + 'these by hand — or zero the other two groups first and review what is left.',
};

/**
 * A pool carrying no value posts no journal entry either way — the GL poster
 * short-circuits on a zero delta — so the mixed-source ambiguity has nothing
 * to bite on and the group is safe to load as-is.
 */
const isHarmless = (lines: ZeroOutLine[]) => lines.every((l) => l.value === 0);

const fmtQty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtMoney = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Builds the lines that flatten a warehouse's on-hand to nil, grouped by
 * whether the GL ever capitalised the stock. Each group loads as its own
 * adjustment because `postGl` is a document-level flag — see ZeroOutPreview.
 */
export function ZeroOutDialog({ open, onClose, warehouseId, onLoad }: {
  open: boolean;
  onClose: () => void;
  warehouseId: string;
  onLoad: (lines: ZeroOutLine[], postGl: boolean, bucket: PoolBucket) => void;
}) {
  const [itemClass, setItemClass] = useState('');
  const { data, isLoading } = useZeroOutPreview({
    warehouseId: open ? warehouseId : '',
    ...(itemClass ? { itemClass } : {}),
  });

  const buckets: PoolBucket[] = ['uncapitalised', 'capitalised', 'mixed'];
  const present = buckets.filter((b) => (data?.summary[b].pools ?? 0) > 0);

  return (
    <Modal open={open} onClose={onClose} title="Zero out on-hand stock" size="xl">
      <div className="space-y-4">
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium">Item class</label>
          <Combobox value={itemClass} onChange={setItemClass} options={CLASS_OPTIONS} />
        </div>

        {isLoading && <p className="text-sm text-zinc-500">Reading on-hand…</p>}

        {!isLoading && present.length === 0 && (
          <EmptyState icon={PackageOpen} title="Nothing on hand" description="No stock matches this warehouse and class." />
        )}

        {present.map((bucket) => {
          const s = data!.summary[bucket];
          const lines = data!.lines.filter((l) => l.bucket === bucket);
          return (
            <BucketPanel
              key={bucket}
              bucket={bucket}
              pools={s.pools}
              qty={s.qty}
              value={s.value}
              lines={lines}
              // A zero-valued mixed group posts no entry either way, so it
              // loads with the GL off rather than being held back.
              onLoad={() => { onLoad(lines, bucket === 'capitalised', bucket); onClose(); }}
            />
          );
        })}
      </div>
    </Modal>
  );
}

function BucketPanel({ bucket, pools, qty, value, lines, onLoad }: {
  bucket: PoolBucket;
  pools: number;
  qty: number;
  value: number;
  lines: ZeroOutLine[];
  onLoad: () => void;
}) {
  // Mixed only needs a manual call when there is value at stake to misroute.
  const blocked = bucket === 'mixed' && !isHarmless(lines);
  const isMixed = bucket === 'mixed';
  return (
    <div className={`rounded-lg border p-3 ${blocked
      ? 'border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30'
      : 'border-zinc-200 dark:border-zinc-800'}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {blocked && <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />}
          <h4 className="text-sm font-semibold">{BUCKET_LABEL[bucket]}</h4>
          <Badge variant={bucket === 'capitalised' ? 'info' : 'warning'}>
            {pools} {pools === 1 ? 'batch' : 'batches'}
          </Badge>
        </div>
        {!blocked && (
          <Button type="button" variant="secondary" onClick={onLoad}>
            Load {pools} {pools === 1 ? 'line' : 'lines'}
            {bucket === 'capitalised' ? ' (posts GL)' : ' (no GL)'}
          </Button>
        )}
      </div>

      <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
        {isMixed && !blocked
          ? 'One batch fed by both sources — but it carries no value, so no journal entry '
            + 'posts either way and it is safe to zero out directly.'
          : BUCKET_HELP[bucket]}
      </p>
      <p className="mb-2 text-xs text-zinc-500">
        Total <strong>{fmtQty(qty)}</strong> · ledger value <strong>{fmtMoney(value)}</strong>
      </p>

      <PoolTable lines={lines} />
    </div>
  );
}

function PoolTable({ lines }: { lines: ZeroOutLine[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Item</Th>
          <Th>Batch</Th>
          <Th className="text-right">On hand</Th>
          <Th className="text-right">Avg cost</Th>
          <Th className="text-right">Value</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => (
          <TableRow key={`${l.itemId}-${l.batchNo ?? ''}`}>
            <TableCell>{l.itemName}</TableCell>
            <TableCell className="font-mono text-xs">{l.batchNo ?? '—'}</TableCell>
            <TableCell className="text-right">{fmtQty(l.qty)}</TableCell>
            <TableCell className="text-right">{fmtMoney(l.avgCost)}</TableCell>
            <TableCell className="text-right">{fmtMoney(l.value)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

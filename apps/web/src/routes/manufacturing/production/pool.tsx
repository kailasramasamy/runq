/**
 * Input pool — /manufacturing/production/pool
 *
 * What is on hand behind a BOM's inputs, in the order a run would draw it.
 * On a dairy floor this is the milk pool: cut-open pouches and yesterday's
 * balance ahead of the tanker that landed at noon.
 *
 * Ordering comes from the server, which builds it with the same merged FEFO
 * queue the backflush walks — a pool that sorted its own way would show one
 * thing and the next run would take another.
 *
 * Read-only on purpose. Looking reserves nothing; it exists so the floor can
 * see whether the next batch breaks into fresh stock before committing, and
 * so stock that is in the books but not in the tank has somewhere to show up.
 */
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Layers, ArrowRight } from 'lucide-react';
import {
  PageHeader, Card, CardHeader, CardContent, Combobox, EmptyState, Skeleton, Button,
} from '@/components/ui';
import { useBoms } from '@/hooks/queries/use-boms';
import { useWarehouses, useAutoSelectWarehouse } from '@/hooks/queries/use-inventory';
import { useInputPool } from '@/hooks/queries/use-production';
import { formatINR } from '@/lib/utils';
import type { InputPoolLine, InputPoolBatch } from '@runq/types';

export function InputPoolPage() {
  const [bomId, setBomId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const { data: bomsData } = useBoms({ isActive: true, limit: 200 });
  const { data: warehousesData } = useWarehouses();
  useAutoSelectWarehouse(warehouseId, setWarehouseId);

  const { data: poolRes, isLoading } = useInputPool(bomId, warehouseId);
  const pool = poolRes?.data;

  const bomOptions = [
    { value: '', label: 'Select BOM…' },
    ...(bomsData?.data?.map((b) => ({ value: b.id, label: `${b.bomCode} — ${b.name}` })) ?? []),
  ];
  const warehouses = Array.isArray(warehousesData) ? warehousesData : [];
  const warehouseOptions = [
    { value: '', label: 'Select warehouse…' },
    ...warehouses.filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Input pool' },
        ]}
        title="Input pool"
        description="What a run would draw on, in the order it would draw it. Nothing here is reserved."
        actions={
          bomId ? (
            <Link to="/manufacturing/production/new">
              <Button style={{ background: '#E11D48', borderColor: '#E11D48' }}>
                Record production <ArrowRight size={13} className="ml-1" />
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Card>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Combobox
              options={bomOptions}
              value={bomId}
              onChange={setBomId}
              placeholder="Search BOM…"
            />
            <Combobox
              options={warehouseOptions}
              value={warehouseId}
              onChange={setWarehouseId}
              placeholder="Select warehouse…"
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-col gap-4">
        {!bomId ? (
          <EmptyState
            icon={Layers}
            title="Pick a recipe"
            description="The pool is shown per BOM — its inputs and everything they accept instead."
          />
        ) : isLoading ? (
          <Card><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
        ) : !pool || pool.lines.length === 0 ? (
          <EmptyState icon={Layers} title="No input lines" description="This BOM has nothing to pool." />
        ) : (
          pool.lines.map((line) => <PoolLineCard key={line.inputItemId} line={line} />)
        )}
      </div>
    </div>
  );
}

function PoolLineCard({ line }: { line: InputPoolLine }) {
  // How far down the queue the next batch reaches — the boundary between
  // "milk that needs using" and stock the run would not touch.
  let drawn = 0;
  const nextBatchCovers = line.batches.map((b) => {
    const before = drawn;
    drawn += b.qty;
    return before < line.qtyPerBatch;
  });

  return (
    <Card>
      <CardHeader
        title={line.inputItemName}
        action={
          <span className="text-[12.5px] font-semibold">
            {line.totalQty.toFixed(3)} {line.uom}
          </span>
        }
      />
      <CardContent>
        {line.substitutes.length > 0 && (
          <p className="mb-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            pooled with {line.substitutes.map((s) => s.itemName).join(' / ')}
          </p>
        )}

        <p className="mb-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
          {line.qtyPerBatch.toFixed(3)} {line.uom} per batch —{' '}
          <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
            {line.batchesCovered} full {line.batchesCovered === 1 ? 'batch' : 'batches'}
          </span>{' '}
          covered by what is on hand.
        </p>

        {line.batches.length === 0 ? (
          <p className="py-3 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
            Nothing on hand.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ color: 'var(--text-3)' }}>
                  <th className="pb-1.5 text-left font-medium">Item / batch</th>
                  <th className="pb-1.5 text-left font-medium">Expiry</th>
                  <th className="pb-1.5 text-right font-medium">Qty</th>
                  <th className="pb-1.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {line.batches.map((b, i) => (
                  <BatchRow
                    key={`${b.itemId}-${b.batchNo ?? i}`}
                    batch={b}
                    uom={line.uom}
                    inNextBatch={nextBatchCovers[i] ?? false}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BatchRow({
  batch, uom, inNextBatch,
}: {
  batch: InputPoolBatch;
  uom: string;
  /** Falls inside what the next batch would draw — shown so it reads as "next". */
  inNextBatch: boolean;
}) {
  return (
    <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
      <td className="py-1.5">
        <span className="font-medium">{batch.itemName}</span>
        {batch.batchNo && (
          <span className="ml-2 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
            {batch.batchNo}
          </span>
        )}
        {inNextBatch && (
          <span
            className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: 'rgba(225,29,72,0.10)', color: '#be123c' }}
          >
            next draw
          </span>
        )}
      </td>
      <td className="py-1.5" style={{ color: 'var(--text-3)' }}>
        {batch.expiryDate ?? '—'}
      </td>
      <td className="py-1.5 text-right font-medium">
        {batch.qty.toFixed(3)} {uom}
      </td>
      <td className="py-1.5 text-right" style={{ color: 'var(--text-3)' }}>
        {formatINR(batch.unitCost)}
      </td>
    </tr>
  );
}

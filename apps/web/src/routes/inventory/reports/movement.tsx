import { useNavigate, useSearch } from '@tanstack/react-router';
import { BarChart3 } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Card, CardContent,
} from '@/components/ui';
import { useMovementSummary, useWarehouses } from '@/hooks/queries/use-inventory';

const GROUP_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

type GroupBy = 'day' | 'week' | 'month';
type Params = { warehouseId?: string; from?: string; to?: string; groupBy?: GroupBy };

export function MovementReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const warehouseId = params.warehouseId ?? '';
  const from = params.from ?? monthAgo;
  const to = params.to ?? today;
  const groupBy: GroupBy = params.groupBy ?? 'day';

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/reports/movement',
      search: (prev) => {
        const next = { ...(prev as Params), ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (!next[k]) delete next[k];
        }
        return next;
      },
      replace: true,
    });
  }

  const { data: warehouses } = useWarehouses();
  const { data, isLoading } = useMovementSummary({
    warehouseId: warehouseId || undefined, from, to, groupBy,
  });
  const rows = data?.rows ?? [];

  const totals = rows.reduce(
    (s, r) => ({
      qtyIn: s.qtyIn + r.qtyIn,
      qtyOut: s.qtyOut + r.qtyOut,
      valueIn: s.valueIn + r.valueIn,
      valueOut: s.valueOut + r.valueOut,
      movements: s.movements + r.movements,
    }),
    { qtyIn: 0, qtyOut: 0, valueIn: 0, valueOut: 0, movements: 0 },
  );

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Stock movement"
        description="In / out totals grouped by period."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">From</label>
          <Input type="date" value={from} max={to} onChange={(e) => update({ from: e.target.value || undefined })} />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">To</label>
          <Input type="date" value={to} max={today} onChange={(e) => update({ to: e.target.value || undefined })} />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Group by</label>
          <Combobox
            value={groupBy}
            onChange={(v) => update({ groupBy: (v as GroupBy) || undefined })}
            options={GROUP_OPTIONS}
          />
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={warehouseId} onChange={(v) => update({ warehouseId: v || undefined })} options={whOptions} />
        </div>
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card><CardContent>
            <div className="mb-1 text-xs font-medium text-zinc-500">In (qty)</div>
            <div className="text-lg font-mono font-semibold tabular-nums text-green-600">
              {totals.qtyIn.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
            </div>
          </CardContent></Card>
          <Card><CardContent>
            <div className="mb-1 text-xs font-medium text-zinc-500">Out (qty)</div>
            <div className="text-lg font-mono font-semibold tabular-nums text-red-600">
              {totals.qtyOut.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
            </div>
          </CardContent></Card>
          <Card><CardContent>
            <div className="mb-1 text-xs font-medium text-zinc-500">In (value)</div>
            <div className="text-lg font-mono font-semibold tabular-nums">
              ₹{totals.valueIn.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </CardContent></Card>
          <Card><CardContent>
            <div className="mb-1 text-xs font-medium text-zinc-500">Out (value)</div>
            <div className="text-lg font-mono font-semibold tabular-nums">
              ₹{totals.valueOut.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </CardContent></Card>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No movements in this window"
          description="Try widening the date range."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Period</Th>
              <Th className="text-right">Qty in</Th>
              <Th className="text-right">Qty out</Th>
              <Th className="text-right">Value in</Th>
              <Th className="text-right">Value out</Th>
              <Th className="text-right">Movements</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.period}>
                <TableCell>{r.period}</TableCell>
                <TableCell className="text-right tabular-nums text-green-600">
                  {r.qtyIn > 0 ? r.qtyIn.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-red-600">
                  {r.qtyOut > 0 ? r.qtyOut.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.valueIn > 0 ? `₹${r.valueIn.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.valueOut > 0 ? `₹${r.valueOut.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.movements}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

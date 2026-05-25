import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarClock, Search } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge,
} from '@/components/ui';
import { useExpiring } from '@/hooks/queries/use-inventory';

const WINDOW_OPTIONS = [
  { value: '7', label: 'Next 7 days' },
  { value: '15', label: 'Next 15 days' },
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: 'Next 60 days' },
  { value: '90', label: 'Next 90 days' },
  { value: '180', label: 'Next 180 days' },
];

type Params = { withinDays?: string; includeExpired?: string; q?: string };

export function ExpiryReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const withinDays = Number(params.withinDays ?? 30);
  const includeExpired = params.includeExpired === 'true';
  const q = params.q ?? '';

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/reports/expiry',
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

  const { data, isLoading } = useExpiring({ withinDays, includeExpired });
  const allRows = data ?? [];

  const ql = q.toLowerCase();
  const rows = ql
    ? allRows.filter(
        (r) =>
          r.itemName.toLowerCase().includes(ql) ||
          (r.itemSku ?? '').toLowerCase().includes(ql) ||
          r.warehouseName.toLowerCase().includes(ql),
      )
    : allRows;

  return (
    <div>
      <PageHeader
        title="Batch expiry"
        description="Batches in stock with an expiry date inside the window. Use it to drive FEFO dispatch and discount runs."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search item, SKU, warehouse…"
          icon={<Search size={13} />}
          className="w-72 max-w-full"
          value={q}
          onChange={(e) => update({ q: e.target.value || undefined })}
        />
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Within (days)</label>
          <Combobox
            value={String(withinDays)}
            onChange={(v) => update({ withinDays: v || undefined })}
            options={WINDOW_OPTIONS}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={(e) => update({ includeExpired: e.target.checked ? 'true' : undefined })}
          />
          Include already-expired batches
        </label>
        <span className="num ml-auto text-[12px]" style={{ color: 'var(--text-3)' }}>
          {rows.length} rows
        </span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No batches expiring in this window"
          description="Try widening the window or include already-expired batches."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Item</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th>Expiry</Th>
              <Th className="text-right">Days</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Value</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.itemId}-${r.warehouseId}-${r.batchNo}`}>
                <TableCell>
                  <div className="font-medium">{r.itemName}</div>
                  {r.itemSku && <div className="font-mono text-xs text-zinc-500">{r.itemSku}</div>}
                </TableCell>
                <TableCell>{r.warehouseName}</TableCell>
                <TableCell className="font-mono text-xs">{r.batchNo}</TableCell>
                <TableCell>{r.expiryDate}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.daysToExpiry < 0
                    ? <Badge variant="danger">{Math.abs(r.daysToExpiry)}d ago</Badge>
                    : r.daysToExpiry <= 7
                      ? <Badge variant="warning">{r.daysToExpiry}d</Badge>
                      : r.daysToExpiry}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} {r.itemUnit ?? ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ₹{r.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

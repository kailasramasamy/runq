import { useNavigate, useSearch } from '@tanstack/react-router';
import { Tags, Search } from 'lucide-react';
import {
  PageHeader, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Badge, Combobox,
} from '@/components/ui';
import { useSerialList, useWarehouses } from '@/hooks/queries/use-inventory';

type SerialStatus = 'in_stock' | 'sold' | 'returned' | 'scrapped' | 'in_transit';
type Params = { q?: string; status?: SerialStatus; warehouseId?: string };

const STATUS_TONES: Record<SerialStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  in_stock: 'success',
  sold: 'info',
  returned: 'warning',
  scrapped: 'danger',
  in_transit: 'info',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'sold', label: 'Sold' },
  { value: 'returned', label: 'Returned' },
  { value: 'scrapped', label: 'Scrapped' },
  { value: 'in_transit', label: 'In transit' },
];

export function SerialListPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const search = params.q ?? '';
  const statusFilter = params.status ?? '';
  const warehouseId = params.warehouseId ?? '';

  function updateSearch(patch: Partial<Params>) {
    navigate({
      to: '/inventory/serials',
      search: (prev: Params) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof Params)[]) {
          if (next[k] === '' || next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    } as never);
  }

  const { data: warehouses } = useWarehouses();
  const { data, isLoading } = useSerialList({
    status: statusFilter || undefined,
    warehouseId: warehouseId || undefined,
  });
  const allRows = data?.data ?? [];

  const rows = allRows.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.serialNo.toLowerCase().includes(q) || s.itemName.toLowerCase().includes(q) || (s.itemSku ?? '').toLowerCase().includes(q);
  });

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  const hasFilters = !!search || !!statusFilter || !!warehouseId;

  return (
    <div>
      <PageHeader
        title="Serials"
        description="Per-unit serial tracking. Captured on GRN line save (Phase 4) — lookup powers warranty / RMA."
        fullWidth
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search serial # or item…"
            value={search}
            onChange={(e) => updateSearch({ q: e.target.value || undefined })}
          />
        </div>
        <Combobox
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => updateSearch({ status: (v || undefined) as SerialStatus | undefined })}
          placeholder="All statuses"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <Combobox
          options={whOptions}
          value={warehouseId}
          onChange={(v) => updateSearch({ warehouseId: v || undefined })}
          placeholder="All warehouses"
          inputClassName="h-8 py-0 text-[12.5px]"
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} serials</span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={hasFilters ? 'No serials match your filters' : 'No serials captured yet'}
          description={hasFilters ? 'Try adjusting your search or filters.' : "Serial capture lands in Phase 4. Mark an item as 'tracks serials' and scan units on GRN."}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Serial #</Th>
              <Th>Item</Th>
              <Th>Batch</Th>
              <Th>Warehouse</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono">{s.serialNo}</TableCell>
                <TableCell>
                  <div className="font-medium">{s.itemName}</div>
                  {s.itemSku && <div className="font-mono text-xs text-zinc-500">{s.itemSku}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{s.batchNo ?? '—'}</TableCell>
                <TableCell>{s.warehouseName ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_TONES[s.currentStatus]}>
                    {s.currentStatus.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-500">{s.updatedAt.slice(0, 16).replace('T', ' ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

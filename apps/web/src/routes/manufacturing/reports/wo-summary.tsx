import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { useWoSummary } from '@/hooks/queries/use-mfg-reports';
import { useBoms } from '@/hooks/queries/use-boms';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import { formatINR } from '@/lib/utils';

const ACCENT = '#E11D48';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'closed', label: 'Closed' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'draft', label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Params = { bomId?: string; warehouseId?: string; status?: string; from?: string; to?: string };

export function WoSummaryReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;

  function update(patch: Partial<Params>) {
    navigate({
      to: '/manufacturing/reports/wo-summary',
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

  const { data: bomsData } = useBoms({ isActive: true, limit: 200 });
  const { data: warehouses } = useWarehouses();

  const filter = {
    bomId: params.bomId,
    warehouseId: params.warehouseId,
    status: params.status,
    from: params.from,
    to: params.to,
  };
  const { data, isLoading } = useWoSummary(filter);
  const rows = data?.data ?? [];

  const bomOptions = [
    { value: '', label: 'All BOMs' },
    ...(bomsData?.data ?? []).map((b) => ({ value: b.id, label: `${b.bomCode} — ${b.name}` })),
  ];
  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="WO summary"
        description="Planned vs actual output, cost, and yield variance per work order."
        fullWidth
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">From</label>
          <Input type="date" value={params.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} />
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">To</label>
          <Input type="date" value={params.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} />
        </div>
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">BOM</label>
          <Combobox value={params.bomId ?? ''} onChange={(v) => update({ bomId: v || undefined })} options={bomOptions} />
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Warehouse</label>
          <Combobox value={params.warehouseId ?? ''} onChange={(v) => update({ warehouseId: v || undefined })} options={whOptions} />
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
          <Combobox value={params.status ?? ''} onChange={(v) => update({ status: v || undefined })} options={STATUS_OPTIONS} />
        </div>
        <div className="ml-auto flex items-center gap-2 self-end">
          <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} rows</span>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} cols={10} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No work orders match"
          description="Adjust the date range, BOM, or status filter to see results."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>WO #</Th>
              <Th>BOM</Th>
              <Th>Output item</Th>
              <Th>Warehouse</Th>
              <Th>Scheduled</Th>
              <Th>Status</Th>
              <Th className="text-right">Planned qty</Th>
              <Th className="text-right">Actual qty</Th>
              <Th className="text-right">Variance %</Th>
              <Th className="text-right">Consumed ₹</Th>
              <Th className="text-right">Output ₹</Th>
              <Th>Closed at</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <WoSummaryRowComponent key={row.woId} row={row} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function WoSummaryRowComponent({ row }: { row: import('@runq/types').WoSummaryRow }) {
  const pct = row.yieldVariancePct;
  const pctColor = pct === null ? undefined : pct >= 0 ? '#16a34a' : '#d97706';

  return (
    <TableRow className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
      <TableCell>
        <Link
          to="/manufacturing/wos/$woId"
          params={{ woId: row.woId }}
          className="font-mono text-sm font-semibold hover:underline"
          style={{ color: '#E11D48' }}
        >
          {row.woNumber}
        </Link>
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs">{row.bomCode}</span>
        <span className="ml-1 text-xs text-zinc-500">{row.bomName}</span>
      </TableCell>
      <TableCell className="text-sm">{row.outputItemName}</TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{row.warehouseName}</TableCell>
      <TableCell className="text-sm">{row.scheduledFor}</TableCell>
      <TableCell><WoStatusPill status={row.status} /></TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{row.plannedQty.toFixed(2)}</TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{row.actualOutputQty.toFixed(2)}</TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums" style={{ color: pctColor }}>
        {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
      </TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{formatINR(row.consumedValue)}</TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{formatINR(row.outputValue)}</TableCell>
      <TableCell className="text-sm text-zinc-500">{row.closedAt ?? '—'}</TableCell>
    </TableRow>
  );
}

const WO_PILL: Record<string, { label: string; bg: string; text: string }> = {
  draft:       { label: 'Draft',      bg: 'var(--surface-2)',         text: 'var(--text-2)' },
  in_progress: { label: 'In progress', bg: 'rgba(234,88,12,0.10)',   text: '#ea580c' },
  completed:   { label: 'Completed',  bg: 'rgba(22,163,74,0.10)',    text: '#16a34a' },
  closed:      { label: 'Closed',     bg: 'rgba(225,29,72,0.10)',    text: '#e11d48' },
  cancelled:   { label: 'Cancelled',  bg: 'rgba(220,38,38,0.08)',    text: '#dc2626' },
};

function WoStatusPill({ status }: { status: string }) {
  const cfg = WO_PILL[status] ?? { label: status, bg: 'var(--surface-2)', text: 'var(--text-2)' };
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}


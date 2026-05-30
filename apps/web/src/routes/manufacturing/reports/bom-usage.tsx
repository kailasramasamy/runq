import { useNavigate, useSearch } from '@tanstack/react-router';
import { FlaskConical, Search } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { useBomUsage } from '@/hooks/queries/use-mfg-reports';
import type { BomUsageRow } from '@runq/types';

const ACCENT = '#E11D48';

const ACTIVE_OPTIONS = [
  { value: '', label: 'All BOMs' },
  { value: 'true', label: 'Active only' },
  { value: 'false', label: 'Inactive only' },
];

type Params = { isActive?: string; search?: string; from?: string; to?: string };

export function BomUsageReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;

  function update(patch: Partial<Params>) {
    navigate({
      to: '/manufacturing/reports/bom-usage',
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

  const filter = {
    isActive: params.isActive === 'true' ? true : params.isActive === 'false' ? false : undefined,
    search: params.search,
    from: params.from,
    to: params.to,
  };
  const { data, isLoading } = useBomUsage(filter);

  // Sort by runs desc
  const rows = [...(data?.data ?? [])].sort((a, b) => b.runs - a.runs);

  return (
    <div>
      <PageHeader
        title="BOM usage"
        description="Run frequency, yield variance, and last run date per bill of materials."
        fullWidth
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search BOM code or name…"
          icon={<Search size={13} />}
          className="w-72 max-w-full"
          value={params.search ?? ''}
          onChange={(e) => update({ search: e.target.value || undefined })}
        />
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">From</label>
          <Input type="date" value={params.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} />
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">To</label>
          <Input type="date" value={params.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} />
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
          <Combobox value={params.isActive ?? ''} onChange={(v) => update({ isActive: v || undefined })} options={ACTIVE_OPTIONS} />
        </div>
        <div className="ml-auto flex items-center gap-2 self-end">
          <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} BOMs</span>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} cols={9} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No BOM usage data"
          description="Close work orders to generate BOM usage statistics."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>BOM code</Th>
              <Th>Name</Th>
              <Th>Output item</Th>
              <Th>Active</Th>
              <Th className="text-right">Runs</Th>
              <Th className="text-right">Closed runs</Th>
              <Th className="text-right">Total planned</Th>
              <Th className="text-right">Total actual</Th>
              <Th className="text-right">Avg variance %</Th>
              <Th>Last run</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <BomUsageRowComponent key={row.bomId} row={row} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function BomUsageRowComponent({ row }: { row: BomUsageRow }) {
  const pct = row.avgYieldVariancePct;
  const pctColor = pct === null ? undefined : pct >= 0 ? '#16a34a' : '#d97706';

  return (
    <TableRow className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
      <TableCell>
        <a
          href={`/manufacturing/boms/${row.bomId}`}
          className="font-mono text-sm font-semibold hover:underline"
          style={{ color: ACCENT }}
        >
          {row.bomCode}
        </a>
      </TableCell>
      <TableCell className="text-sm">{row.bomName}</TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{row.outputItemName}</TableCell>
      <TableCell>
        <ActivePill active={row.isActive} />
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums" style={{ color: ACCENT }}>
        {row.runs}
      </TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{row.closedRuns}</TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{row.totalPlannedQty.toFixed(2)}</TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{row.totalActualQty.toFixed(2)}</TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums" style={{ color: pctColor }}>
        {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
      </TableCell>
      <TableCell className="text-sm text-zinc-500">{row.lastRunAt ?? '—'}</TableCell>
    </TableRow>
  );
}

function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold"
      style={
        active
          ? { background: 'rgba(22,163,74,0.10)', color: '#16a34a' }
          : { background: 'var(--surface-2)', color: 'var(--text-3)' }
      }
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

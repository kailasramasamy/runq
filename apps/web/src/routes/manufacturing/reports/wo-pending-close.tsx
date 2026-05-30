import { useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import {
  PageHeader, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState,
} from '@/components/ui';
import { useWoPendingClose } from '@/hooks/queries/use-mfg-reports';
import { formatINR } from '@/lib/utils';
import type { WoPendingCloseRow } from '@runq/types';

const ACCENT = '#E11D48';

type Params = { minAgeDays?: string };

export function WoPendingCloseReportPage() {
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const [localAge, setLocalAge] = useState(params.minAgeDays ?? '0');

  function applyAge(val: string) {
    const n = parseInt(val, 10);
    const safe = isNaN(n) || n < 0 ? '0' : String(n);
    setLocalAge(safe);
    navigate({
      to: '/manufacturing/reports/wo-pending-close',
      search: { minAgeDays: safe === '0' ? undefined : safe },
      replace: true,
    });
  }

  const filter = {
    minAgeDays: params.minAgeDays ? parseInt(params.minAgeDays, 10) : undefined,
  };
  const { data, isLoading } = useWoPendingClose(filter);
  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="WOs pending close"
        description="Completed work orders that haven't been closed by finance yet."
        fullWidth
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Min age (days)
          </label>
          <Input
            type="number"
            min="0"
            value={localAge}
            onChange={(e) => setLocalAge(e.target.value)}
            onBlur={(e) => applyAge(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyAge(localAge); }}
            className="w-40"
          />
        </div>
        <div className="ml-auto flex items-center self-end">
          <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{rows.length} WOs</span>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} cols={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No work orders pending close"
          description="All completed WOs have been closed — great job!"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>WO #</Th>
              <Th>BOM</Th>
              <Th>Scheduled for</Th>
              <Th>Completed at</Th>
              <Th className="text-right">Age (days)</Th>
              <Th className="text-right">Consumed ₹</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <PendingCloseRowComponent key={row.woId} row={row} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function PendingCloseRowComponent({ row }: { row: WoPendingCloseRow }) {
  return (
    <TableRow className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
      <TableCell>
        <Link
          to="/manufacturing/wos/$woId"
          params={{ woId: row.woId }}
          className="font-mono text-sm font-semibold hover:underline"
          style={{ color: ACCENT }}
        >
          {row.woNumber}
        </Link>
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs">{row.bomCode}</span>
        <span className="ml-1 text-xs text-zinc-500">{row.bomName}</span>
      </TableCell>
      <TableCell className="text-sm">{row.scheduledFor}</TableCell>
      <TableCell className="text-sm">{row.completedAt}</TableCell>
      <TableCell className="text-right">
        <AgeBadge days={row.ageDays} />
      </TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">
        {formatINR(row.consumedValue)}
      </TableCell>
    </TableRow>
  );
}

function AgeBadge({ days }: { days: number }) {
  const cfg =
    days <= 1
      ? { bg: 'rgba(22,163,74,0.10)', text: '#16a34a' }
      : days <= 4
      ? { bg: 'rgba(217,119,6,0.10)', text: '#d97706' }
      : { bg: 'rgba(225,29,72,0.10)', text: '#e11d48' };

  return (
    <span
      className="inline-flex items-center justify-center rounded px-2 py-0.5 font-mono text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {days}d
    </span>
  );
}

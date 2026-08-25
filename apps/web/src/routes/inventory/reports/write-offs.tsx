/**
 * Daily write-off register — what stock was lost each day and what it cost.
 *
 * Grouped by day rather than by document: the question this answers is "how
 * much did we lose yesterday", and a plant can raise several write-offs a day
 * across items. Production loss carries the run it came off, so a spike can be
 * traced straight back to the batch that caused it.
 */
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import {
  PageHeader, Combobox, Input, Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Card, CardContent,
} from '@/components/ui';
import { useWriteOffs, useWarehouses } from '@/hooks/queries/use-inventory';
import { formatINR } from '@/lib/utils';

const REASON_LABELS: Record<string, string> = {
  production_loss: 'Production loss',
  damage: 'Damage',
  expiry: 'Expiry',
  theft: 'Theft',
  free_issue: 'Free issue',
};

const REASON_OPTIONS = [
  { value: '', label: 'All reasons' },
  ...Object.entries(REASON_LABELS).map(([value, label]) => ({ value, label })),
];

type Params = { warehouseId?: string; from?: string; to?: string; reason?: string };

export function WriteOffReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as Params;
  const warehouseId = params.warehouseId ?? '';
  const reason = params.reason ?? '';
  const from = params.from ?? monthAgo;
  const to = params.to ?? today;

  function update(patch: Partial<Params>) {
    navigate({
      to: '/inventory/reports/write-offs',
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
  const { data, isLoading } = useWriteOffs({
    warehouseId: warehouseId || undefined, reason: reason || undefined, from, to,
  });
  const days = data?.days ?? [];

  const whOptions = [
    { value: '', label: 'All warehouses' },
    ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Write-offs"
        description="Stock lost each day, and what it cost."
        fullWidth
      />

      <Card className="mb-4">
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input type="date" value={from} onChange={(e) => update({ from: e.target.value })} />
            <Input type="date" value={to} onChange={(e) => update({ to: e.target.value })} />
            <Combobox
              options={whOptions}
              value={warehouseId}
              onChange={(v) => update({ warehouseId: v })}
              placeholder="All warehouses"
            />
            <Combobox
              options={REASON_OPTIONS}
              value={reason}
              onChange={(v) => update({ reason: v })}
              placeholder="All reasons"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : days.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="No write-offs in this period"
          description="Nothing was written off between these dates."
        />
      ) : (
        <>
          <Card className="mb-4">
            <CardContent>
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>
                  Total loss over {days.length} day(s) with write-offs
                </span>
                <span className="text-[18px] font-semibold" style={{ color: '#dc2626' }}>
                  {formatINR(data?.totalValue ?? 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Table>
            <TableHeader>
              <TableRow>
                <Th>Date / Item</Th>
                <Th>Reason</Th>
                <Th>Batch</Th>
                <Th>Source</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Loss</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((day) => [
                <TableRow key={day.date} style={{ background: 'var(--surface-2)' }}>
                  <TableCell><strong>{day.date}</strong></TableCell>
                  <TableCell colSpan={3} />
                  <TableCell align="right">{day.qty}</TableCell>
                  <TableCell align="right"><strong>{formatINR(day.value)}</strong></TableCell>
                </TableRow>,
                ...day.lines.map((l, i) => (
                  <TableRow key={`${day.date}-${l.adjNo}-${i}`}>
                    <TableCell>
                      <div>{l.itemName}</div>
                      <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                        {l.adjNo} · {l.warehouseName}
                      </div>
                    </TableCell>
                    <TableCell>{REASON_LABELS[l.reason] ?? l.reason}</TableCell>
                    <TableCell>{l.batchNo ?? '—'}</TableCell>
                    <TableCell>{l.woNumber ?? '—'}</TableCell>
                    <TableCell align="right">{l.qty}{l.uom ? ` ${l.uom}` : ''}</TableCell>
                    <TableCell align="right">{formatINR(l.value)}</TableCell>
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

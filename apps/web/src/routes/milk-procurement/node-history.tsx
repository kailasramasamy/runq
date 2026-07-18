import { useState } from 'react';
import { PageHeader, EmptyState, Combobox, StatsCard } from '@/components/ui';
import { Droplets, TrendingUp, Building2, Coins } from 'lucide-react';
import { useNodeDaily, type MpNodeDayRow } from '@/hooks/queries/use-milk-procurement';
import { DailyTable, NodeDailyTable, DailyQtyChart, DailyQualityCharts, CycleFilter, cycleRange, defaultCycleState, sumDailyByDate, type CycleState } from './_daily-history';
import { DayPoursEditModal } from './_pour-edit-modal';

const fmt1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Period totals for the rows currently shown (respects the cycle range and the
 * node filter), mirroring the Farmers-tab summary cards. */
function NodeSummaryCards({ rows, nodeLabel }: { rows: MpNodeDayRow[]; nodeLabel: string }) {
  const t = rows.reduce(
    (a, r) => ({ qty: a.qty + r.totalQty, am: a.am + r.amQty, pm: a.pm + r.pmQty, gross: a.gross + r.grossAmount }),
    { qty: 0, am: 0, pm: 0, gross: 0 },
  );
  const nodeCount = new Set(rows.map((r) => r.nodeId)).size;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatsCard title="Total milk (L)" value={t.qty} icon={Droplets} formatValue={(v) => `${fmt1(v)} L`} />
      <StatsCard title="AM / PM (L)" value={t.qty} icon={TrendingUp} formatValue={() => `${fmt1(t.am)} / ${fmt1(t.pm)}`} />
      <StatsCard title={`${nodeLabel}s`} value={nodeCount} icon={Building2} formatValue={(v) => String(v)} />
      <StatsCard title="Gross value" value={t.gross} icon={Coins} />
    </div>
  );
}

/** Distinct nodes present in the window, busiest (by total qty) first — powers
 * the node dropdown so only nodes with data appear. */
function distinctNodes(rows: MpNodeDayRow[]) {
  const m = new Map<string, { nodeId: string; nodeName: string; nodeCode: string; qty: number }>();
  for (const r of rows) {
    const e = m.get(r.nodeId) ?? { nodeId: r.nodeId, nodeName: r.nodeName, nodeCode: r.nodeCode, qty: 0 };
    e.qty += r.totalQty;
    m.set(r.nodeId, e);
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty);
}

export function MpNodeHistoryPage({ groupBy, title, nodeLabel }: {
  groupBy: 'vmcc' | 'cc'; title: string; nodeLabel: string;
}) {
  return (
    <div>
      <PageHeader
        title={title}
        description={`Daily collection totals per ${nodeLabel.toLowerCase()}. Pick one below.`}
        fullWidth
      />
      <NodeHistoryBody groupBy={groupBy} nodeLabel={nodeLabel} />
    </div>
  );
}

/** The node-daily history body (filters + chart + table) minus the page header,
 * so it can stand alone (/reports/by-cc) or nest inside the Collection history
 * scope tabs. VMCC and CC differ only by `groupBy`. */
export function NodeHistoryBody({ groupBy, nodeLabel }: { groupBy: 'vmcc' | 'cc'; nodeLabel: string }) {
  const [cyc, setCyc] = useState<CycleState>(defaultCycleState);
  const [nodeId, setNodeId] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<{ nodeId: string; date: string } | null>(null);

  const { data } = useNodeDaily({ ...cycleRange(cyc), groupBy });
  const rows = data?.data ?? [];
  const nodes = distinctNodes(rows);
  // Default is "All" (empty id): the table lists every node's daily rows, while
  // the chart shows the summed-across-nodes daily trend. A picked node filters.
  const activeId = nodes.some((n) => n.nodeId === nodeId) ? nodeId : '';
  const nodeRows = rows.filter((r) => r.nodeId === activeId);
  const allRows = [...rows].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.totalQty - a.totalQty));
  const chartRows = activeId ? nodeRows : sumDailyByDate(rows);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <CycleFilter value={cyc} onChange={(next) => { setCyc(next); setPage(1); }} />
        {nodes.length > 0 && (
          <div className="w-72">
            <Combobox
              label={nodeLabel}
              value={activeId}
              onChange={(v) => { setNodeId(v); setPage(1); }}
              options={[
                { value: '', label: `All ${nodeLabel}s` },
                ...nodes.map((n) => ({ value: n.nodeId, label: `${n.nodeCode} · ${n.nodeName}` })),
              ]}
            />
          </div>
        )}
      </div>

      {nodes.length === 0 ? (
        <EmptyState
          icon={Droplets}
          title="No pours in this window"
          description={`Record collection to see per-${nodeLabel.toLowerCase()} daily history.`}
        />
      ) : (
        <>
          <NodeSummaryCards rows={activeId ? nodeRows : rows} nodeLabel={nodeLabel} />
          <DailyQtyChart rows={chartRows} />
          <DailyQualityCharts rows={chartRows} />
          {activeId ? (
            <DailyTable rows={nodeRows} page={page} setPage={setPage}
              onEditDay={(date) => setEdit({ nodeId: activeId, date })} />
          ) : (
            <NodeDailyTable rows={allRows} page={page} setPage={setPage} nodeLabel={nodeLabel}
              onEditRow={(nid, date) => setEdit({ nodeId: nid, date })} />
          )}
        </>
      )}
      {edit && (
        <DayPoursEditModal
          filter={{ nodeId: edit.nodeId, collectionDate: edit.date }}
          title={`${nodeLabel} · ${edit.date}`}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { PageHeader, EmptyState, Combobox } from '@/components/ui';
import { Droplets } from 'lucide-react';
import { useNodeDaily, type MpNodeDayRow } from '@/hooks/queries/use-milk-procurement';
import { DailyTable, DailyQtyChart, CycleFilter, cycleRange, defaultCycleState, type CycleState } from './_daily-history';

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
  const [cyc, setCyc] = useState<CycleState>(defaultCycleState);
  const [nodeId, setNodeId] = useState('');
  const [page, setPage] = useState(1);

  const { data } = useNodeDaily({ ...cycleRange(cyc), groupBy });
  const rows = data?.data ?? [];
  const nodes = distinctNodes(rows);
  const activeId = nodeId && nodes.some((n) => n.nodeId === nodeId) ? nodeId : nodes[0]?.nodeId ?? '';
  const nodeRows = rows.filter((r) => r.nodeId === activeId);

  return (
    <div>
      <PageHeader
        title={title}
        description={`Daily collection totals per ${nodeLabel.toLowerCase()}. Pick one below.`}
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <CycleFilter value={cyc} onChange={(next) => { setCyc(next); setPage(1); }} />
        {nodes.length > 0 && (
          <div className="w-72">
            <Combobox
              label={nodeLabel}
              value={activeId}
              onChange={(v) => { setNodeId(v); setPage(1); }}
              options={nodes.map((n) => ({ value: n.nodeId, label: `${n.nodeCode} · ${n.nodeName}` }))}
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
          <DailyQtyChart rows={nodeRows} />
          <DailyTable rows={nodeRows} page={page} setPage={setPage} />
        </>
      )}
    </div>
  );
}

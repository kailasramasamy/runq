import { useState, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Card, CardContent, StatsCard, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton,
} from '@/components/ui';
import {
  useNodes, useNodeAvailability, useConsignments,
  type MpNode, type MpConsignment,
} from '@/hooks/queries/use-milk-procurement';
import { today, daysAgo, DayAccordion, groupByDate, Pills } from './_node-dashboard-shared';
import { ConsignmentTable } from './node-dashboard-vmcc';

export const PP_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tankers', label: 'Receive / Tankers' },
] as const;

export function PpDashboard({ node, tab }: { node: MpNode; tab: string }) {
  return tab === 'tankers' ? <Tankers nodeId={node.id} /> : <Overview nodeId={node.id} />;
}

function useCcNames() {
  const { data } = useNodes({ nodeType: 'cc', limit: 200 });
  const map = useMemo(() => new Map((data?.data ?? []).map((n) => [n.id, `${n.code} · ${n.name}`])), [data]);
  return (id: string) => map.get(id) ?? id.slice(0, 8);
}

// ── Overview (today's inbound tankers from CCs) ────────────────────────────────
function Overview({ nodeId }: { nodeId: string }) {
  const d = today();
  const { data, isLoading } = useConsignments({ toNodeId: nodeId, kind: 'cc_to_pp', collectionDate: d, limit: 200 });
  const { data: avail } = useNodeAvailability(nodeId, d);
  const ccName = useCcNames();
  const rows = data?.data ?? [];
  const a = avail?.data;

  const variance = useMemo(() => {
    let disp = 0, recv = 0;
    for (const c of rows) { if (c.status === 'received') { disp += Number(c.dispatchQty ?? 0); recv += Number(c.receiptQty ?? 0); } }
    return disp > 0 ? ((recv - disp) / disp) * 100 : 0;
  }, [rows]);
  const perCc = groupBySource(rows);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Received today (L)" value={a?.collected ?? 0} formatValue={(v) => v.toLocaleString()} />
        <StatsCard title="On hand (L)" value={a?.available ?? 0} formatValue={(v) => v.toLocaleString()} />
        <StatsCard title="Tankers today" value={rows.length} formatValue={(v) => String(v)} />
        <StatsCard title="Variance vs dispatch" value={variance} formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><Th>Chilling centre</Th><Th align="right">Tankers</Th><Th align="right">Qty (L)</Th><Th>Status</Th></TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton rows={3} cols={4} /> : perCc.length === 0 ? <TableEmpty colSpan={4} message="No tankers received today." /> : (
                perCc.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Link to="/milk-procurement/nodes/$id" params={{ id: r.id }} className="text-zinc-900 hover:underline dark:text-zinc-100">{ccName(r.id)}</Link></TableCell>
                    <TableCell className="text-right tabular-nums">{r.n}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.qty.toLocaleString()}</TableCell>
                    <TableCell>{r.transit > 0 ? <Badge variant="default">{r.transit} in transit</Badge> : <Badge variant="success">received</Badge>}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <RecentReceives rows={rows} ccName={ccName} loading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

function groupBySource(rows: MpConsignment[]) {
  const m = new Map<string, { n: number; qty: number; transit: number }>();
  for (const c of rows) {
    const cur = m.get(c.fromNodeId) ?? { n: 0, qty: 0, transit: 0 };
    cur.n += 1;
    if (c.status === 'received') cur.qty += Number(c.receiptQty ?? 0);
    else if (c.status === 'in_transit') cur.transit += 1;
    m.set(c.fromNodeId, cur);
  }
  return [...m.entries()].map(([id, v]) => ({ id, ...v }));
}

function RecentReceives({ rows, ccName, loading }: { rows: MpConsignment[]; ccName: (id: string) => string; loading?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><Th>Tanker</Th><Th>From CC</Th><Th align="right">Receipt (L)</Th><Th>FAT/SNF/W</Th><Th align="right">Var %</Th><Th>Status</Th></TableRow>
      </TableHeader>
      <TableBody>
        {loading ? <TableSkeleton rows={4} cols={6} /> : rows.length === 0 ? <TableEmpty colSpan={6} message="No tankers today." /> : (
          rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-xs text-zinc-500">{c.containerNo || c.consignmentNo}</TableCell>
              <TableCell><Link to="/milk-procurement/nodes/$id" params={{ id: c.fromNodeId }} className="text-zinc-900 hover:underline dark:text-zinc-100">{ccName(c.fromNodeId)}</Link></TableCell>
              <TableCell className="text-right tabular-nums">{c.receiptQty ?? c.dispatchQty ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{c.receiptFat ?? c.dispatchFat ?? '—'}/{c.receiptSnf ?? c.dispatchSnf ?? '—'}/{c.receiptWater ?? c.dispatchWater ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{c.variancePct ?? '—'}</TableCell>
              <TableCell><Badge variant={c.status === 'received' ? 'success' : c.status === 'reversed' ? 'danger' : 'default'}>{c.status.replace('_', ' ')}</Badge></TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

// ── Receive / Tankers ──────────────────────────────────────────────────────────
function Tankers({ nodeId }: { nodeId: string }) {
  const [mode, setMode] = useState<'list' | 'history'>('list');
  const { data, isLoading } = useConsignments({ fromNodeId: undefined, toNodeId: nodeId, kind: 'cc_to_pp', from: daysAgo(30), to: today(), limit: 500 });
  const ccName = useCcNames();
  const rows = data?.data ?? [];

  return (
    <div className="space-y-3">
      <Pills value={mode} onChange={setMode} options={[{ value: 'list', label: 'Tankers' }, { value: 'history', label: 'By day' }]} />
      {isLoading ? <Card><CardContent><TableSkeleton rows={6} cols={1} /></CardContent></Card>
        : mode === 'list' ? (
          <Card><CardContent className="p-0"><RecentReceives rows={rows} ccName={ccName} /></CardContent></Card>
        ) : (
          <DayAccordion
            groups={groupByDate(rows, (c) => c.collectionDate)}
            emptyHint="No tankers received in the last 30 days."
            renderSummary={(g) => {
              const qty = g.rows.reduce((a, c) => a + Number(c.receiptQty ?? c.dispatchQty ?? 0), 0);
              return <span className="tabular-nums">{qty.toLocaleString()} L · {g.rows.length} tankers</span>;
            }}
            renderBody={(g) => <ConsignmentTable rows={g.rows} />}
          />
        )}
    </div>
  );
}

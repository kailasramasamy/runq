import { useState, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Card, CardContent, StatsCard, Badge, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton,
} from '@/components/ui';
import {
  useNodes, useNodeAvailability, useConsignments, useReceivedDaily, useCollectionSummary,
  type MpNode, type MpConsignment,
} from '@/hooks/queries/use-milk-procurement';
import {
  today, daysAgo, QcReportView, DayAccordion, groupByDate, aggregateByDate, weighted, Pills,
  type QcSample,
} from './_node-dashboard-shared';
import { ConsignmentTable } from './node-dashboard-vmcc';

export const CC_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'receive', label: 'Receive' },
  { id: 'quality', label: 'Quality' },
  { id: 'dispatch', label: 'Dispatch' },
] as const;

export function CcDashboard({ node, tab }: { node: MpNode; tab: string }) {
  switch (tab) {
    case 'receive': return <Receive nodeId={node.id} />;
    case 'quality': return <Quality nodeId={node.id} />;
    case 'dispatch': return <Dispatch nodeId={node.id} />;
    default: return <Overview node={node} />;
  }
}

// ── name lookup for source VMCCs ───────────────────────────────────────────────
function useVmccNames() {
  const { data } = useNodes({ nodeType: 'vmcc', limit: 200 });
  const list = data?.data ?? [];
  const map = useMemo(() => new Map(list.map((n) => [n.id, `${n.code} · ${n.name}`])), [data]);
  return { list, name: (id: string) => map.get(id) ?? id.slice(0, 8) };
}

const toSamples = (rows: MpConsignment[]): (QcSample & { fromNodeId: string })[] =>
  rows.map((c) => ({
    date: c.collectionDate, fromNodeId: c.fromNodeId, qty: Number(c.receiptQty ?? 0),
    fat: c.receiptFat != null ? Number(c.receiptFat) : null,
    snf: c.receiptSnf != null ? Number(c.receiptSnf) : null,
    water: c.receiptWater,
  }));

// ── Overview (child-VMCC network today) ────────────────────────────────────────
function Overview({ node }: { node: MpNode }) {
  const d = today();
  const { list } = useVmccNames();
  const children = list.filter((n) => n.parentNodeId === node.id);
  const { data: inbound } = useConsignments({ toNodeId: node.id, collectionDate: d, limit: 200 });
  const { data: avail } = useNodeAvailability(node.id, d);
  const a = avail?.data;

  const inboundBy = useMemo(() => {
    const m = new Map<string, { received: number; transit: number }>();
    for (const c of inbound?.data ?? []) {
      const cur = m.get(c.fromNodeId) ?? { received: 0, transit: 0 };
      if (c.status === 'received') cur.received += Number(c.receiptQty ?? 0);
      else if (c.status === 'in_transit') cur.transit += Number(c.dispatchQty ?? 0);
      m.set(c.fromNodeId, cur);
    }
    return m;
  }, [inbound]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Received today (L)" value={a?.collected ?? 0} formatValue={(v) => v.toLocaleString()} />
        <StatsCard title="On hand (L)" value={a?.available ?? 0} formatValue={(v) => v.toLocaleString()} />
        <StatsCard title="Dispatched (L)" value={a?.dispatched ?? 0} formatValue={(v) => v.toLocaleString()} />
        <StatsCard title="Source VMCCs" value={children.length} formatValue={(v) => String(v)} />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><Th>VMCC</Th><Th align="right">Collected (L)</Th><Th align="right">AM / PM</Th><Th align="right">Farmers</Th><Th align="right">At CC (L)</Th></TableRow>
            </TableHeader>
            <TableBody>
              {children.length === 0 ? <TableEmpty colSpan={5} message="No VMCCs linked to this chilling centre." /> : (
                children.map((v) => <VmccTodayRow key={v.id} vmcc={v} date={d} inbound={inboundBy.get(v.id)} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function VmccTodayRow({ vmcc, date, inbound }: { vmcc: MpNode; date: string; inbound?: { received: number; transit: number } }) {
  const { data } = useCollectionSummary({ from: date, to: date, nodeId: vmcc.id });
  const s = data?.data;
  return (
    <TableRow>
      <TableCell><Link to="/milk-procurement/nodes/$id" params={{ id: vmcc.id }} className="text-zinc-900 hover:underline dark:text-zinc-100">{vmcc.code} · {vmcc.name}</Link></TableCell>
      <TableCell className="text-right tabular-nums">{(s?.totalQty ?? 0).toLocaleString()}</TableCell>
      <TableCell className="text-right tabular-nums">{s?.amQty ?? 0} / {s?.pmQty ?? 0}</TableCell>
      <TableCell className="text-right tabular-nums">{s?.farmerCount ?? 0}</TableCell>
      <TableCell className="text-right tabular-nums">
        {inbound ? (
          <span>{inbound.received.toLocaleString()}{inbound.transit > 0 && <span className="text-amber-600 dark:text-amber-400"> +{inbound.transit.toLocaleString()} in transit</span>}</span>
        ) : '—'}
      </TableCell>
    </TableRow>
  );
}

// ── Receive history ────────────────────────────────────────────────────────────
function Receive({ nodeId }: { nodeId: string }) {
  const { data, isLoading } = useReceivedDaily({ nodeId, from: daysAgo(30), to: today() });
  const days = (data?.data ?? []).map((d) => ({ date: d.date, rows: [d] }));
  if (isLoading) return <Card><CardContent><TableSkeleton rows={6} cols={1} /></CardContent></Card>;
  return (
    <DayAccordion
      groups={days}
      emptyHint="No milk received in the last 30 days."
      renderSummary={(g) => {
        const d = g.rows[0];
        return <span className="tabular-nums">{d.totalQty.toLocaleString()} L · {d.vmccCount} VMCCs · F {d.fat?.toFixed(1) ?? '—'} / S {d.snf?.toFixed(1) ?? '—'}</span>;
      }}
      renderBody={(g) => <ReceiveDayDetail nodeId={nodeId} date={g.date} />}
    />
  );
}

function ReceiveDayDetail({ nodeId, date }: { nodeId: string; date: string }) {
  const { data, isLoading } = useConsignments({ toNodeId: nodeId, kind: 'vmcc_to_cc', status: 'received', collectionDate: date, limit: 200 });
  const { name } = useVmccNames();
  const rows = data?.data ?? [];
  const byVmcc = groupBySource(rows);
  if (isLoading) return <TableSkeleton rows={2} cols={1} />;
  return (
    <Table>
      <TableHeader>
        <TableRow><Th>VMCC</Th><Th align="right">Trips</Th><Th align="right">Qty (L)</Th><Th align="right">FAT</Th><Th align="right">SNF</Th><Th align="right">Water</Th></TableRow>
      </TableHeader>
      <TableBody>
        {byVmcc.length === 0 ? <TableEmpty colSpan={6} message="—" /> : byVmcc.map((r) => (
          <TableRow key={r.id}>
            <TableCell><Link to="/milk-procurement/nodes/$id" params={{ id: r.id }} className="text-zinc-900 hover:underline dark:text-zinc-100">{name(r.id)}</Link></TableCell>
            <TableCell className="text-right tabular-nums">{r.n}</TableCell>
            <TableCell className="text-right tabular-nums">{r.qty.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.fat?.toFixed(1) ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{r.snf?.toFixed(1) ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{r.water?.toFixed(1) ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function groupBySource(rows: MpConsignment[]) {
  const m = new Map<string, (QcSample & { fromNodeId: string })[]>();
  for (const s of toSamples(rows)) (m.get(s.fromNodeId) ?? m.set(s.fromNodeId, []).get(s.fromNodeId)!).push(s);
  return [...m.entries()].map(([id, ss]) => ({ id, n: ss.length, ...weighted(ss) }));
}

// ── Quality (All / By-VMCC / Ranking) ──────────────────────────────────────────
function Quality({ nodeId }: { nodeId: string }) {
  const [scope, setScope] = useState<'all' | 'vmcc' | 'rank'>('all');
  const [win, setWin] = useState<'7' | '14' | '30'>('14');
  const [vmccId, setVmccId] = useState('');
  const { list, name } = useVmccNames();
  const { data } = useConsignments({ toNodeId: nodeId, kind: 'vmcc_to_cc', status: 'received', from: daysAgo(Number(win)), to: today(), limit: 500 });
  const samples = toSamples(data?.data ?? []);
  const filtered = scope === 'vmcc' && vmccId ? samples.filter((s) => s.fromNodeId === vmccId) : samples;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pills value={scope} onChange={setScope} options={[{ value: 'all', label: 'All VMCCs' }, { value: 'vmcc', label: 'By VMCC' }, { value: 'rank', label: 'Ranking' }]} />
        <Pills value={win} onChange={setWin} options={[{ value: '7', label: '7d' }, { value: '14', label: '14d' }, { value: '30', label: '30d' }]} />
        {scope === 'vmcc' && (
          <div className="w-64">
            <Combobox value={vmccId} onChange={setVmccId} placeholder="Pick a VMCC"
              options={list.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} />
          </div>
        )}
      </div>
      {scope === 'rank'
        ? <Ranking samples={samples} name={name} />
        : <QcReportView days={aggregateByDate(filtered)} heroLabel="Received in window" emptyHint="Receive milk from VMCCs to see daily QC trends." />}
    </div>
  );
}

function Ranking({ samples, name }: { samples: (QcSample & { fromNodeId: string })[]; name: (id: string) => string }) {
  const [sort, setSort] = useState<'qty' | 'fat' | 'snf' | 'water'>('qty');
  const rows = useMemo(() => {
    const m = new Map<string, (QcSample & { fromNodeId: string })[]>();
    for (const s of samples) (m.get(s.fromNodeId) ?? m.set(s.fromNodeId, []).get(s.fromNodeId)!).push(s);
    const out = [...m.entries()].map(([id, ss]) => ({ id, ...weighted(ss) }));
    const asc = sort === 'water';
    return out.sort((a, b) => {
      const av = a[sort] ?? (asc ? Infinity : -Infinity), bv = b[sort] ?? (asc ? Infinity : -Infinity);
      return asc ? av - bv : bv - av;
    });
  }, [samples, sort]);

  const head = (k: typeof sort, label: string) => (
    <Th align="right"><button onClick={() => setSort(k)} className={sort === k ? 'font-semibold text-[var(--accent-text)]' : ''}>{label}</button></Th>
  );
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow><Th>VMCC</Th>{head('qty', 'Qty (L)')}{head('fat', 'FAT')}{head('snf', 'SNF')}{head('water', 'Water ↓')}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableEmpty colSpan={5} message="No receipts in this window." /> : rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell><span className="mr-2 text-xs text-zinc-400">#{i + 1}</span><Link to="/milk-procurement/nodes/$id" params={{ id: r.id }} className="text-zinc-900 hover:underline dark:text-zinc-100">{name(r.id)}</Link></TableCell>
                <TableCell className="text-right tabular-nums">{r.qty.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.fat?.toFixed(1) ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{r.snf?.toFixed(1) ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{r.water?.toFixed(1) ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Dispatch (cc → pp) ─────────────────────────────────────────────────────────
function Dispatch({ nodeId }: { nodeId: string }) {
  const { data, isLoading } = useConsignments({ fromNodeId: nodeId, kind: 'cc_to_pp', from: daysAgo(30), to: today(), limit: 500 });
  const groups = groupByDate(data?.data ?? [], (c) => c.collectionDate);
  if (isLoading) return <Card><CardContent><TableSkeleton rows={6} cols={1} /></CardContent></Card>;
  return (
    <DayAccordion
      groups={groups}
      emptyHint="No dispatches to the processing plant in the last 30 days."
      renderSummary={(g) => {
        const qty = g.rows.reduce((a, c) => a + Number(c.dispatchQty ?? 0), 0);
        return <span className="tabular-nums">{qty.toLocaleString()} L · {g.rows.length} tankers</span>;
      }}
      renderBody={(g) => <ConsignmentTable rows={g.rows} />}
    />
  );
}


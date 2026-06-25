import { useState, useMemo } from 'react';
import {
  Card, CardContent, StatsCard, Badge, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton,
} from '@/components/ui';
import {
  useCollectionSummary, useNodeAvailability, usePours, usePoursDaily, useConsignments, useFarmers,
  type MpNode, type MpPour, type MpConsignment,
} from '@/hooks/queries/use-milk-procurement';
import {
  today, daysAgo, SummaryStats, QcReportView, DayAccordion, groupByDate, Pills,
} from './_node-dashboard-shared';

export const VMCC_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'collection', label: 'Collection' },
  { id: 'quality', label: 'Quality' },
  { id: 'dispatch', label: 'Dispatch' },
] as const;

export function VmccDashboard({ node, tab }: { node: MpNode; tab: string }) {
  switch (tab) {
    case 'collection': return <Collection nodeId={node.id} />;
    case 'quality': return <Quality nodeId={node.id} />;
    case 'dispatch': return <Dispatch nodeId={node.id} />;
    default: return <Overview nodeId={node.id} />;
  }
}

// ── farmer-name lookup (shared across tabs; react-query dedupes) ────────────────
function useFarmerName(nodeId: string) {
  const { data } = useFarmers({ nodeId, limit: 500 });
  const map = useMemo(() => new Map((data?.data ?? []).map((f) => [f.id, `${f.code} · ${f.name}`])), [data]);
  return (id: string) => map.get(id) ?? id.slice(0, 8);
}

const SHIFT_PILLS: { value: '' | 'am' | 'pm'; label: string }[] = [
  { value: '', label: 'All' }, { value: 'pm', label: 'PM' }, { value: 'am', label: 'AM' },
];

// ── Overview ───────────────────────────────────────────────────────────────────
function Overview({ nodeId }: { nodeId: string }) {
  const d = today();
  const { data: sum } = useCollectionSummary({ from: d, to: d, nodeId });
  const { data: avail } = useNodeAvailability(nodeId, d);
  const { data: pours, isLoading } = usePours({ nodeId, collectionDate: d, status: 'recorded', limit: 200 });
  const farmerName = useFarmerName(nodeId);
  const a = avail?.data;

  return (
    <div className="space-y-4">
      <SummaryStats summary={sum?.data} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatsCard title="Collected today (L)" value={a?.collected ?? 0} formatValue={(v) => v.toLocaleString()} />
        <StatsCard title="To dispatch (L)" value={a?.available ?? 0} formatValue={(v) => v.toLocaleString()} />
        <StatsCard title="Dispatched (L)" value={a?.dispatched ?? 0} formatValue={(v) => v.toLocaleString()} />
      </div>
      <Card>
        <CardContent className="p-0">
          <PourTable pours={pours?.data ?? []} farmerName={farmerName} loading={isLoading} empty="No pours recorded today." />
        </CardContent>
      </Card>
    </div>
  );
}

function PourTable({ pours, farmerName, loading, empty }: { pours: MpPour[]; farmerName: (id: string) => string; loading?: boolean; empty: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Receipt</Th><Th>Farmer</Th><Th>Shift</Th><Th align="right">Qty</Th><Th>FAT/SNF</Th><Th>Grade</Th><Th align="right">₹</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? <TableSkeleton rows={5} cols={7} /> : pours.length === 0 ? <TableEmpty colSpan={7} message={empty} /> : (
          pours.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="text-xs text-zinc-500">{p.receiptNo}</TableCell>
              <TableCell>{farmerName(p.farmerId)}</TableCell>
              <TableCell>{p.shift.toUpperCase()}</TableCell>
              <TableCell className="text-right tabular-nums">{p.qtyLitres}</TableCell>
              <TableCell className="tabular-nums">{p.fat ?? '—'}/{p.snf ?? '—'}</TableCell>
              <TableCell><Badge variant={p.qualityGrade === 'a' ? 'success' : 'default'}>{p.qualityGrade?.toUpperCase() ?? '—'}</Badge></TableCell>
              <TableCell className="text-right tabular-nums">{p.lineAmount}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

// ── Collection history (by day / by farmer) ────────────────────────────────────
function Collection({ nodeId }: { nodeId: string }) {
  const [mode, setMode] = useState<'day' | 'farmer'>('day');
  const [shift, setShift] = useState<'' | 'am' | 'pm'>('');
  const { data, isLoading } = usePours({ nodeId, from: daysAgo(30), to: today(), status: 'recorded', shift: shift || undefined, limit: 500 });
  const farmerName = useFarmerName(nodeId);
  const pours = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pills value={mode} onChange={setMode} options={[{ value: 'day', label: 'By day' }, { value: 'farmer', label: 'By farmer' }]} />
        <Pills value={shift} onChange={setShift} options={SHIFT_PILLS} />
      </div>
      {isLoading ? <Card><CardContent><TableSkeleton rows={6} cols={1} /></CardContent></Card>
        : mode === 'day' ? <ByDay pours={pours} farmerName={farmerName} /> : <ByFarmer pours={pours} farmerName={farmerName} />}
    </div>
  );
}

function ByDay({ pours, farmerName }: { pours: MpPour[]; farmerName: (id: string) => string }) {
  const groups = groupByDate(pours, (p) => p.collectionDate);
  return (
    <DayAccordion
      groups={groups}
      emptyHint="No pours in the last 30 days."
      renderSummary={(g) => {
        const qty = g.rows.reduce((a, p) => a + Number(p.qtyLitres), 0);
        const amt = g.rows.reduce((a, p) => a + Number(p.lineAmount), 0);
        return <span className="tabular-nums">{qty.toLocaleString()} L · ₹{amt.toLocaleString()} · {new Set(g.rows.map((p) => p.farmerId)).size} farmers</span>;
      }}
      renderBody={(g) => <PourTable pours={g.rows} farmerName={farmerName} empty="—" />}
    />
  );
}

function ByFarmer({ pours, farmerName }: { pours: MpPour[]; farmerName: (id: string) => string }) {
  const rows = useMemo(() => {
    const m = new Map<string, { qty: number; amt: number; n: number }>();
    for (const p of pours) {
      const cur = m.get(p.farmerId) ?? { qty: 0, amt: 0, n: 0 };
      cur.qty += Number(p.qtyLitres); cur.amt += Number(p.lineAmount); cur.n += 1;
      m.set(p.farmerId, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].qty - a[1].qty);
  }, [pours]);

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow><Th>Farmer</Th><Th align="right">Pours</Th><Th align="right">Qty (L)</Th><Th align="right">₹</Th></TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableEmpty colSpan={4} message="No pours in the last 30 days." /> : (
              rows.map(([id, v]) => (
                <TableRow key={id}>
                  <TableCell>{farmerName(id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.n}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.qty.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.amt.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Quality (QC trend) ─────────────────────────────────────────────────────────
function Quality({ nodeId }: { nodeId: string }) {
  const [win, setWin] = useState<'7' | '14' | '30'>('14');
  const [farmerId, setFarmerId] = useState('');
  const { data: farmers } = useFarmers({ nodeId, limit: 500 });
  const { data } = usePoursDaily({ nodeId, from: daysAgo(Number(win)), to: today(), farmerId: farmerId || undefined });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pills value={win} onChange={setWin} options={[{ value: '7', label: '7d' }, { value: '14', label: '14d' }, { value: '30', label: '30d' }]} />
        <div className="w-64">
          <Combobox value={farmerId} onChange={setFarmerId} placeholder="All farmers"
            options={[{ value: '', label: 'All farmers' }, ...(farmers?.data ?? []).map((f) => ({ value: f.id, label: `${f.code} · ${f.name}` }))]} />
        </div>
      </div>
      <QcReportView days={data?.data ?? []} heroLabel="Collected in window" emptyHint="Record pours to see daily QC trends." />
    </div>
  );
}

// ── Dispatch history (vmcc → cc) ───────────────────────────────────────────────
function Dispatch({ nodeId }: { nodeId: string }) {
  const { data, isLoading } = useConsignments({ fromNodeId: nodeId, kind: 'vmcc_to_cc', from: daysAgo(30), to: today(), limit: 500 });
  const groups = groupByDate(data?.data ?? [], (c) => c.collectionDate);
  if (isLoading) return <Card><CardContent><TableSkeleton rows={6} cols={1} /></CardContent></Card>;
  return (
    <DayAccordion
      groups={groups}
      emptyHint="No dispatches in the last 30 days."
      renderSummary={(g) => {
        const qty = g.rows.reduce((a, c) => a + Number(c.dispatchQty ?? 0), 0);
        return <span className="tabular-nums">{qty.toLocaleString()} L · {g.rows.length} trips</span>;
      }}
      renderBody={(g) => <ConsignmentTable rows={g.rows} />}
    />
  );
}

export function ConsignmentTable({ rows }: { rows: MpConsignment[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>No.</Th><Th>Shift</Th><Th align="right">Dispatch</Th><Th align="right">Receipt</Th><Th align="right">Var %</Th><Th>FAT/SNF</Th><Th>Status</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? <TableEmpty colSpan={7} message="—" /> : rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="text-xs text-zinc-500">{c.consignmentNo}</TableCell>
            <TableCell>{c.shift?.toUpperCase() ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{c.dispatchQty ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{c.receiptQty ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{c.variancePct ?? '—'}</TableCell>
            <TableCell className="tabular-nums">{c.receiptFat ?? c.dispatchFat ?? '—'}/{c.receiptSnf ?? c.dispatchSnf ?? '—'}</TableCell>
            <TableCell>
              <Badge variant={c.status === 'received' ? 'success' : c.status === 'reversed' ? 'danger' : 'default'}>{c.status.replace('_', ' ')}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

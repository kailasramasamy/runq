import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Droplets, Truck, PackageCheck, AlertTriangle, Network } from 'lucide-react';
import {
  PageHeader, Card, CardContent, StatsCard, Combobox, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, EmptyState, Skeleton,
} from '@/components/ui';
import { useFlow, useNodes } from '@/hooks/queries/use-milk-procurement';
import type { MpNode, MpFlowNode, MpFlowEdge, MpFlowReport } from '@/hooks/queries/use-milk-procurement';

const ACCENT = '#0F7A5A';
const TYPE_LABEL = { pp: 'PP', cc: 'CC', vmcc: 'VMCC' } as const;
const fmtL = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} L`;

/** One outbound-leg rollup for a node (it may dispatch to several targets). */
interface OutAgg { dispatched: number; received: number; loss: number }
/** A node placed in the VMCC→CC→PP tree with its day's movement. */
interface FlowRow { node: MpNode; level: number; m: MpFlowNode; out: OutAgg | null }

export function MpFlowPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState<'all' | 'am' | 'pm'>('all');
  const { data: flowRes, isLoading } = useFlow({ date, shift: shift === 'all' ? undefined : shift });
  const { data: nodesRes } = useNodes({ limit: 500 });

  const flow = flowRes?.data;
  const nodes = (nodesRes?.data ?? []).filter((n) => n.isActive);
  const rows = buildRows(nodes, flow?.nodes ?? [], flow?.edges ?? []);
  const t = flow?.totals;

  return (
    <div>
      <PageHeader
        title="Milk Flow"
        description="Follow the milk — VMCC → CC → PP — with on-hand balance and per-hop loss for the day."
        fullWidth
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <DateInput label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="w-40">
          <Combobox
            label="Shift"
            value={shift}
            onChange={(v) => setShift(v as 'all' | 'am' | 'pm')}
            options={[
              { value: 'all', label: 'All shifts' },
              { value: 'am', label: 'AM' },
              { value: 'pm', label: 'PM' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Collected" value={t?.collected ?? 0} icon={Droplets} formatValue={fmtL} />
        <StatsCard title="In transit" value={inTransit(t)} icon={Truck} formatValue={fmtL} />
        <StatsCard title="Received at plant" value={t?.receivedAtPlant ?? 0} icon={PackageCheck} formatValue={fmtL} />
        <StatsCard
          title="Measured loss"
          value={t?.measuredLoss ?? 0}
          icon={AlertTriangle}
          formatValue={(v) => `${fmtL(v)} · ${lossPct(t)}`}
        />
      </div>

      <Card className="mt-4">
        <CardContent className="p-0">
          {isLoading ? (
            <FlowSkeleton />
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Network}
                title="No network yet"
                description="Add VMCC, CC and PP nodes to see milk flow across your collection network."
              />
            </div>
          ) : (
            <FlowTable rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FlowTable({ rows }: { rows: FlowRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Node</Th>
          <Th className="text-right">Collected</Th>
          <Th className="text-right">Dispatched</Th>
          <Th className="text-right">Received</Th>
          <Th className="text-right">On hand</Th>
          <Th className="text-right">Loss (to next)</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <FlowRowView key={r.node.id} r={r} />
        ))}
      </TableBody>
    </Table>
  );
}

function FlowRowView({ r }: { r: FlowRow }) {
  const { node, level, m, out } = r;
  const pct = out && out.received + out.loss > 0 ? (out.loss / (out.received + out.loss)) * 100 : null;
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2" style={{ paddingLeft: level * 22 }}>
          <TypeBadge type={node.nodeType} />
          <Link
            to="/milk-procurement/nodes/$id"
            params={{ id: node.id }}
            className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            {node.name}
          </Link>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{node.code}</span>
        </div>
      </TableCell>
      <Num v={m.collected} />
      <Num v={m.dispatchedOut} />
      <Num v={m.receivedIn} />
      <Num v={m.onHand} strong />
      <TableCell className="text-right tabular-nums">
        {pct == null ? (
          <span className="text-zinc-300 dark:text-zinc-600">—</span>
        ) : (
          <span className={pct >= 3 ? 'text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-300'}>
            {fmtL(out!.loss)} · {pct.toFixed(1)}%
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function Num({ v, strong }: { v: number; strong?: boolean }) {
  return (
    <TableCell
      className={`text-right tabular-nums ${
        strong ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'
      }`}
    >
      {v > 0 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : <span className="text-zinc-300 dark:text-zinc-600">0</span>}
    </TableCell>
  );
}

function TypeBadge({ type }: { type: MpNode['nodeType'] }) {
  const tint = type === 'pp' ? '#7c3aed' : type === 'cc' ? '#0369a1' : ACCENT;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: `${tint}22`, color: tint }}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

function FlowSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

// ── pure assembly ────────────────────────────────────────────────────────────

/** Place every active node in the VMCC→CC→PP tree (by parentNodeId), overlay the
 * day's per-node movement, and attach each node's aggregated outbound loss.
 * Orphans (missing parent) are never hidden — they surface at the top level. */
function buildRows(nodes: MpNode[], flowNodes: MpFlowNode[], edges: MpFlowEdge[]): FlowRow[] {
  const metric = new Map(flowNodes.map((m) => [m.nodeId, m]));
  const out = aggregateOut(edges);
  const mk = (node: MpNode, level: number): FlowRow => ({
    node,
    level,
    m: metric.get(node.id) ?? { nodeId: node.id, collected: 0, dispatchedOut: 0, receivedIn: 0, onHand: 0 },
    out: out.get(node.id) ?? null,
  });
  const kids = (pid: string, type: MpNode['nodeType']) =>
    nodes.filter((n) => n.nodeType === type && n.parentNodeId === pid);

  const rows: FlowRow[] = [];
  const seen = new Set<string>();
  const addCc = (cc: MpNode, level: number) => {
    rows.push(mk(cc, level));
    seen.add(cc.id);
    for (const v of kids(cc.id, 'vmcc')) {
      rows.push(mk(v, level + 1));
      seen.add(v.id);
    }
  };
  for (const pp of nodes.filter((n) => n.nodeType === 'pp')) {
    rows.push(mk(pp, 0));
    seen.add(pp.id);
    for (const cc of kids(pp.id, 'cc')) addCc(cc, 1);
  }
  for (const cc of nodes.filter((n) => n.nodeType === 'cc' && !seen.has(n.id))) addCc(cc, 0);
  for (const v of nodes.filter((n) => n.nodeType === 'vmcc' && !seen.has(n.id))) rows.push(mk(v, 0));
  return rows;
}

function aggregateOut(edges: MpFlowEdge[]): Map<string, OutAgg> {
  const m = new Map<string, OutAgg>();
  for (const e of edges) {
    const a = m.get(e.fromNodeId) ?? { dispatched: 0, received: 0, loss: 0 };
    a.dispatched += e.dispatchedQty;
    a.received += e.receivedQty;
    a.loss += e.measuredLoss;
    m.set(e.fromNodeId, a);
  }
  return m;
}

function inTransit(t?: MpFlowReport['totals']): number {
  return t ? Math.max(0, t.dispatched - t.received) : 0;
}

function lossPct(t?: MpFlowReport['totals']): string {
  if (!t) return '0%';
  const base = t.received + t.measuredLoss;
  return base > 0 ? `${((t.measuredLoss / base) * 100).toFixed(1)}%` : '—';
}

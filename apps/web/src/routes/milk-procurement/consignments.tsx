import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Combobox, Input, Badge, Modal,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import {
  useNodes, useConsignments, useDispatchConsignment, useReceiveConsignment, useNodeAvailability,
  useShiftStatus,
  type MpNode, type MpConsignment, type NodeType, type MpAvailability,
  milkTypeLabelOrDash,
} from '@/hooks/queries/use-milk-procurement';
import { ConsignmentHistoryView } from './consignment-history';

// Each consignment leg is one flow between two tiers — the tab is the flow.
type LegKind = 'vmcc_to_cc' | 'cc_to_pp';
interface Leg { kind: LegKind; label: string; from: NodeType; to: NodeType }
const LEGS: Leg[] = [
  { kind: 'vmcc_to_cc', label: 'VMCC → CC', from: 'vmcc', to: 'cc' },
  { kind: 'cc_to_pp', label: 'CC → PP', from: 'cc', to: 'pp' },
];

type ConsignTab = LegKind | 'history';

export function MpConsignmentsPage({ view }: { view: 'operate' | 'history' }) {
  const today = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();
  const [kind, setKind] = useState<LegKind>('vmcc_to_cc');
  const leg = LEGS.find((l) => l.kind === kind)!;

  const { data: nodesData } = useNodes({ limit: 300 });
  const nodes = nodesData?.data ?? [];
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // In-transit lists for both legs: drives tab counts + the active Inbound card.
  const transit: Record<LegKind, ReturnType<typeof useConsignments>> = {
    vmcc_to_cc: useConsignments({ kind: 'vmcc_to_cc', status: 'in_transit', limit: 100 }),
    cc_to_pp: useConsignments({ kind: 'cc_to_pp', status: 'in_transit', limit: 100 }),
  };

  // History is route-driven; the legs are local state. Picking a leg from the
  // history tab returns to the operate route with that leg selected.
  const onTab = (id: ConsignTab) => {
    if (id === 'history') { navigate({ to: '/milk-procurement/consignments/history' }); return; }
    setKind(id);
    if (view === 'history') navigate({ to: '/milk-procurement/consignments' });
  };

  return (
    <div>
      <PageHeader title="Consignments" description="Dispatch, receive, and review milk movements between tiers." fullWidth />
      <Tabs<ConsignTab>
        active={view === 'history' ? 'history' : kind}
        onChange={onTab}
        tabs={[
          ...LEGS.map((l) => ({ id: l.kind, label: l.label, count: transit[l.kind].data?.meta?.total })),
          { id: 'history' as const, label: 'History' },
        ]}
      />
      {view === 'history' ? (
        <ConsignmentHistoryView />
      ) : (
        <>
          {/* key on leg so switching tabs remounts with fresh state — node ids from
              the other leg aren't valid options here and would render as raw UUIDs.
              Keys must be unique among siblings, so prefix each. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <DispatchCard key={`dispatch-${kind}`} leg={leg} nodes={nodes} today={today} />
            <InboundCard key={`inbound-${kind}`} leg={leg} query={transit[kind]} nodeMap={nodeMap} />
          </div>
          <RecentList kind={kind} nodeMap={nodeMap} />
        </>
      )}
    </div>
  );
}

const clockShift = (): 'am' | 'pm' => (new Date().getHours() < 12 ? 'am' : 'pm');
const EMPTY_DISPATCH = { fromNodeId: '', toNodeId: '', containerNo: '', dispatchQty: '', dispatchFat: '', dispatchSnf: '', dispatchWater: '', shift: 'am' as 'am' | 'pm' };

function DispatchCard({ leg, nodes, today }: { leg: Leg; nodes: MpNode[]; today: string }) {
  const dispatch = useDispatchConsignment();
  const { toast } = useToast();
  const [f, setF] = useState({ ...EMPTY_DISPATCH, collectionDate: today, shift: clockShift() });
  const sources = nodes.filter((n) => n.nodeType === leg.from);
  const dests = nodes.filter((n) => n.nodeType === leg.to && n.id !== f.fromNodeId);
  // No-BMC source nodes dispatch each shift separately; BMC nodes pool the whole day.
  const fromBmc = !!f.fromNodeId && nodes.find((n) => n.id === f.fromNodeId)?.hasBmc === true;
  const perShift = !!f.fromNodeId && !fromBmc;
  const avail = useNodeAvailability(f.fromNodeId, f.collectionDate, perShift ? f.shift : undefined).data?.data;
  // Hard gate: collection must be closed before dispatch. BMC needs both shifts.
  const sst = useShiftStatus(f.fromNodeId, f.collectionDate).data?.data;
  const slotClosed = fromBmc ? !!(sst?.am && sst?.pm) : !!sst?.[f.shift];
  const needsClose = !!f.fromNodeId && !slotClosed;

  // Default dispatch QC to the source's volume-weighted average; operator edits after lab-testing the blend.
  useEffect(() => {
    if (!avail) return;
    setF((p) => ({
      ...p,
      dispatchFat: p.dispatchFat === '' && avail.avgFat != null ? String(avail.avgFat) : p.dispatchFat,
      dispatchSnf: p.dispatchSnf === '' && avail.avgSnf != null ? String(avail.avgSnf) : p.dispatchSnf,
      dispatchWater: p.dispatchWater === '' && avail.avgWater != null ? String(avail.avgWater) : p.dispatchWater,
    }));
  }, [avail]);

  const useAll = () => setF((p) => ({
    ...p,
    dispatchQty: avail ? String(avail.available) : p.dispatchQty,
    dispatchFat: avail?.avgFat != null ? String(avail.avgFat) : p.dispatchFat,
    dispatchSnf: avail?.avgSnf != null ? String(avail.avgSnf) : p.dispatchSnf,
    dispatchWater: avail?.avgWater != null ? String(avail.avgWater) : p.dispatchWater,
  }));

  const submit = () => {
    dispatch.mutate(
      {
        kind: leg.kind, fromNodeId: f.fromNodeId, toNodeId: f.toNodeId, collectionDate: f.collectionDate,
        shift: perShift ? f.shift : null,
        containerNo: f.containerNo || null,
        dispatchQty: Number(f.dispatchQty),
        dispatchFat: f.dispatchFat ? Number(f.dispatchFat) : null,
        dispatchSnf: f.dispatchSnf ? Number(f.dispatchSnf) : null,
        dispatchWater: f.dispatchWater ? Number(f.dispatchWater) : null,
      },
      {
        onSuccess: (res) => { toast(`Dispatched ${res.data.consignmentNo}`, 'success'); setF((p) => ({ ...EMPTY_DISPATCH, collectionDate: p.collectionDate })); },
        onError: () => toast('Failed to dispatch', 'error'),
      },
    );
  };

  return (
    <Card>
      <CardHeader>Dispatch · {leg.label}</CardHeader>
      <CardContent className="space-y-3">
        <Combobox label={`From (${leg.from.toUpperCase()})`} value={f.fromNodeId}
          onChange={(v) => {
            // Default the destination to the source's assigned parent (VMCC→its CC,
            // CC→its PP); operator can still pick a different one.
            const parent = nodes.find((n) => n.id === v)?.parentNodeId ?? '';
            const defaultTo = nodes.some((n) => n.id === parent && n.nodeType === leg.to) ? parent : '';
            setF({ ...f, fromNodeId: v, toNodeId: defaultTo, dispatchQty: '', dispatchFat: '', dispatchSnf: '', dispatchWater: '' });
          }}
          options={sources.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} placeholder={`Source ${leg.from.toUpperCase()}…`} required />
        {perShift && (
          <ShiftSelect value={f.shift} onChange={(s) => setF({ ...f, shift: s, dispatchQty: '', dispatchFat: '', dispatchSnf: '', dispatchWater: '' })} />
        )}
        <AvailabilityHint avail={avail} qty={f.dispatchQty} onUseAll={useAll} />
        <Combobox label={`To (${leg.to.toUpperCase()})`} value={f.toNodeId} onChange={(v) => setF({ ...f, toNodeId: v })}
          options={dests.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} placeholder={`Destination ${leg.to.toUpperCase()}…`} required />
        {sources.length > 0 && dests.length === 0 && (
          <p className="-mt-1 text-xs text-amber-600">No {leg.to.toUpperCase()} nodes yet — add one under Nodes to dispatch here.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input label="Date" type="date" value={f.collectionDate} onChange={(e) => setF({ ...f, collectionDate: e.target.value })} />
          <Input label="Container / tanker no." value={f.containerNo} onChange={(e) => setF({ ...f, containerNo: e.target.value })} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Input label="Qty (L)" type="number" value={f.dispatchQty} onChange={(e) => setF({ ...f, dispatchQty: e.target.value })} />
          <Input label="FAT %" type="number" value={f.dispatchFat} onChange={(e) => setF({ ...f, dispatchFat: e.target.value })} />
          <Input label="SNF %" type="number" value={f.dispatchSnf} onChange={(e) => setF({ ...f, dispatchSnf: e.target.value })} />
          <Input label="Water %" type="number" value={f.dispatchWater} onChange={(e) => setF({ ...f, dispatchWater: e.target.value })} />
        </div>
        {avail && (avail.avgFat != null || avail.avgSnf != null || avail.avgWater != null) && (
          <p className="-mt-1 text-xs text-zinc-400">FAT/SNF/Water prefilled with source average — edit after testing the blend.</p>
        )}
        {needsClose && (
          <p className="-mt-1 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-900/15 dark:text-amber-400">
            Close collection for {fromBmc ? 'the day' : `the ${f.shift.toUpperCase()} shift`} before dispatching — do it from the Collection page.
          </p>
        )}
        <Button className="w-full" onClick={submit} loading={dispatch.isPending}
          disabled={needsClose || !f.fromNodeId || !f.toNodeId || !f.dispatchQty || (!!avail && (avail.available <= 0 || Number(f.dispatchQty) > avail.available))}>
          {needsClose ? 'Close collection first' : avail && avail.available <= 0 ? 'Nothing left to dispatch' : 'Dispatch'}
        </Button>
      </CardContent>
    </Card>
  );
}

// No-BMC nodes dispatch each shift separately, so availability is scoped to the
// chosen shift. BMC nodes pool the whole day and never see this control.
function ShiftSelect({ value, onChange }: { value: 'am' | 'pm'; onChange: (s: 'am' | 'pm') => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500">Shift (no BMC — dispatched separately)</label>
      <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
        {(['am', 'pm'] as const).map((s) => (
          <button key={s} type="button" onClick={() => onChange(s)}
            className={`rounded-md px-4 py-1 text-sm font-medium ${value === s ? 'bg-emerald-600 text-white' : 'text-zinc-500'}`}>
            {s === 'am' ? '☀️ AM' : '🌙 PM'}
          </button>
        ))}
      </div>
    </div>
  );
}

// Shows how much milk is on hand at the source node for the chosen date — so the
// operator never dispatches more than was collected/received there.
function AvailabilityHint({ avail, qty, onUseAll }: { avail?: MpAvailability; qty: string; onUseAll: () => void }) {
  if (!avail) return null;
  const over = qty !== '' && Number(qty) > avail.available;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Collected {avail.collected} L · already dispatched {avail.dispatched} L</span>
        <Badge variant={avail.available > 0 ? 'success' : 'default'}>Available {avail.available} L</Badge>
        {avail.available > 0 && (
          <button type="button" className="text-emerald-600 underline" onClick={onUseAll}>Use all</button>
        )}
      </div>
      {over && <p className="text-xs text-amber-600">Qty exceeds available ({avail.available} L) at source.</p>}
    </div>
  );
}

function InboundCard({ leg, query, nodeMap }: { leg: Leg; query: ReturnType<typeof useConsignments>; nodeMap: Map<string, MpNode> }) {
  const inbound = query.data?.data ?? [];
  const [receiving, setReceiving] = useState<MpConsignment | null>(null);
  const nm = (id: string) => nodeMap.get(id)?.name ?? '—';

  return (
    <Card>
      <CardHeader>Inbound · {leg.to.toUpperCase()} · {inbound.length} in transit</CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><Th>No.</Th><Th>From → To</Th><Th>Milk</Th><Th>Dispatched</Th><Th align="right">Action</Th></TableRow></TableHeader>
          <TableBody>
            {query.isLoading ? (
              <TableSkeleton rows={3} cols={4} />
            ) : inbound.length === 0 ? (
              <TableEmpty colSpan={4} message="Nothing in transit." />
            ) : (
              inbound.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{c.consignmentNo}</TableCell>
                  <TableCell className="text-xs">{nm(c.fromNodeId)} → {nm(c.toNodeId)}</TableCell>
                  <TableCell className="text-xs">{milkTypeLabelOrDash(c.milkType)}</TableCell>
                  <TableCell>{c.dispatchQty} L</TableCell>
                  <TableCell className="text-right"><Button size="sm" onClick={() => setReceiving(c)}>Receive</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
      {receiving && <ReceiveModal consignment={receiving} onClose={() => setReceiving(null)} />}
    </Card>
  );
}

function ReceiveModal({ consignment, onClose }: { consignment: MpConsignment; onClose: () => void }) {
  const receive = useReceiveConsignment();
  const { toast } = useToast();
  const [f, setF] = useState({ receiptQty: consignment.dispatchQty ?? '', receiptFat: '', receiptSnf: '', receiptWater: '' });

  const submit = () => {
    receive.mutate(
      { id: consignment.id, data: { receiptQty: Number(f.receiptQty), receiptFat: f.receiptFat ? Number(f.receiptFat) : null, receiptSnf: f.receiptSnf ? Number(f.receiptSnf) : null, receiptWater: f.receiptWater ? Number(f.receiptWater) : null } },
      {
        onSuccess: (res) => { toast(`Received · variance ${res.data.varianceQty} L`, 'success'); onClose(); },
        onError: () => toast('Failed to receive', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title={`Receive ${consignment.consignmentNo}`}>
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">Dispatched: {consignment.dispatchQty} L</p>
        <div className="grid grid-cols-4 gap-2">
          <Input label="Received (L)" type="number" value={String(f.receiptQty)} onChange={(e) => setF({ ...f, receiptQty: e.target.value })} />
          <Input label="FAT %" type="number" value={f.receiptFat} onChange={(e) => setF({ ...f, receiptFat: e.target.value })} />
          <Input label="SNF %" type="number" value={f.receiptSnf} onChange={(e) => setF({ ...f, receiptSnf: e.target.value })} />
          <Input label="Water %" type="number" value={f.receiptWater} onChange={(e) => setF({ ...f, receiptWater: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={receive.isPending} disabled={!f.receiptQty}>Confirm receipt</Button>
        </div>
      </div>
    </Modal>
  );
}

// Receipt − dispatch for a QC param; shows '—' until the consignment is received,
// red when the value dropped in transit (possible dilution / measurement loss).
export function DeltaCell({ receipt, dispatch }: { receipt: string | null; dispatch: string | null }) {
  if (receipt == null || dispatch == null) return <TableCell className="text-zinc-400">—</TableCell>;
  const d = Math.round((Number(receipt) - Number(dispatch)) * 100) / 100;
  return <TableCell className={d < 0 ? 'text-red-600' : ''}>{d > 0 ? '+' : ''}{d}</TableCell>;
}

function RecentList({ kind, nodeMap }: { kind: LegKind; nodeMap: Map<string, MpNode> }) {
  const { data } = useConsignments({ kind, limit: 50 });
  const rows = data?.data ?? [];
  const nm = (id: string) => nodeMap.get(id)?.name ?? '—';
  return (
    <Card className="mt-4">
      <CardHeader>Recent consignments</CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><Th>No.</Th><Th>From → To</Th><Th>Milk</Th><Th>Qty</Th><Th>Qty Δ</Th><Th>FAT Δ</Th><Th>SNF Δ</Th><Th>Water Δ</Th><Th>Status</Th></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8} message="No consignments yet." />
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{c.consignmentNo}</TableCell>
                  <TableCell className="text-xs">{nm(c.fromNodeId)} → {nm(c.toNodeId)}</TableCell>
                  <TableCell className="text-xs">{milkTypeLabelOrDash(c.milkType)}</TableCell>
                  <TableCell>{c.receiptQty ?? c.dispatchQty} L</TableCell>
                  <TableCell className={Number(c.varianceQty) < 0 ? 'text-red-600' : ''}>{c.varianceQty ?? '—'}</TableCell>
                  <DeltaCell receipt={c.receiptFat} dispatch={c.dispatchFat} />
                  <DeltaCell receipt={c.receiptSnf} dispatch={c.dispatchSnf} />
                  <DeltaCell receipt={c.receiptWater != null ? String(c.receiptWater) : null} dispatch={c.dispatchWater != null ? String(c.dispatchWater) : null} />
                  <TableCell><Badge variant={c.status === 'received' ? 'success' : 'default'}>{c.status}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

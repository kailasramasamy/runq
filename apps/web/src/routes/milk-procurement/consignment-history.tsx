import { useMemo, useState } from 'react';
import {
  Card, CardContent, Badge, Combobox, Input, Pagination,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton,
} from '@/components/ui';
import { useNodes, useConsignments, type MpConsignment } from '@/hooks/queries/use-milk-procurement';
import { DeltaCell } from './consignments';

const LEGS = [{ value: '', label: 'All legs' }, { value: 'vmcc_to_cc', label: 'VMCC → CC' }, { value: 'cc_to_pp', label: 'CC → PP' }];
const STATUSES = [
  { value: '', label: 'All' }, { value: 'in_transit', label: 'In transit' },
  { value: 'received', label: 'Received' }, { value: 'reversed', label: 'Reversed' },
];
const SHIFTS = [{ value: '', label: 'All shifts' }, { value: 'am', label: '☀️ AM' }, { value: 'pm', label: '🌙 PM' }];
const LEG_LABEL: Record<string, string> = { vmcc_to_cc: 'VMCC → CC', cc_to_pp: 'CC → PP' };
const SHIFT_LABEL: Record<string, string> = { am: '☀️ AM', pm: '🌙 PM' };
const LIMIT = 50;

export function ConsignmentHistoryView() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({ kind: '', fromNodeId: '', toNodeId: '', from: monthAgo, to: today, shift: '', status: '' });
  const [page, setPage] = useState(1);

  const { data: nodesData } = useNodes({ limit: 300 });
  const nodes = nodesData?.data ?? [];
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const nm = (id: string) => nodeMap.get(id)?.name ?? id.slice(0, 8);
  const nodeOpt = (label: string) => [{ value: '', label }, ...nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))];

  const { data, isLoading } = useConsignments({
    kind: f.kind || undefined, fromNodeId: f.fromNodeId || undefined, toNodeId: f.toNodeId || undefined,
    from: f.from || undefined, to: f.to || undefined, shift: f.shift || undefined, status: f.status || undefined, page, limit: LIMIT,
  });
  const rows = data?.data ?? [];
  const meta = data?.meta;
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };

  return (
    <div>
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-2 py-4 md:grid-cols-6">
          <Combobox label="Leg" value={f.kind} onChange={(v) => set({ kind: v })} options={LEGS} />
          <Combobox label="From node" value={f.fromNodeId} onChange={(v) => set({ fromNodeId: v })} options={nodeOpt('All nodes')} placeholder="All nodes" />
          <Combobox label="To node" value={f.toNodeId} onChange={(v) => set({ toNodeId: v })} options={nodeOpt('All nodes')} placeholder="All nodes" />
          <Input label="From" type="date" value={f.from} max={f.to} onChange={(e) => set({ from: e.target.value })} />
          <Input label="To" type="date" value={f.to} max={today} onChange={(e) => set({ to: e.target.value })} />
          <Combobox label="Shift" value={f.shift} onChange={(v) => set({ shift: v })} options={SHIFTS} />
          <Combobox label="Status" value={f.status} onChange={(v) => set({ status: v })} options={STATUSES} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Date</Th><Th>No.</Th><Th>Leg</Th><Th>Shift</Th><Th>From → To</Th><Th>Container</Th>
                <Th align="right">Disp.</Th><Th align="right">Rcpt.</Th><Th align="right">Qty Δ</Th><Th>FAT Δ</Th><Th>SNF Δ</Th><Th>Water Δ</Th><Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={8} cols={13} />
              ) : rows.length === 0 ? (
                <TableEmpty colSpan={13} message="No consignments for these filters." />
              ) : (
                rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs tabular-nums">{c.collectionDate}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{c.consignmentNo}</TableCell>
                    <TableCell className="text-xs">{LEG_LABEL[c.kind]}</TableCell>
                    <TableCell className="text-xs">{c.shift ? SHIFT_LABEL[c.shift] : '—'}</TableCell>
                    <TableCell className="text-xs">{nm(c.fromNodeId)} → {nm(c.toNodeId)}</TableCell>
                    <TableCell className="text-xs">{c.containerNo ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.dispatchQty ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.receiptQty ?? '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(c.varianceQty) < 0 ? 'text-red-600' : ''}`}>{c.varianceQty ?? '—'}</TableCell>
                    <DeltaCell receipt={c.receiptFat} dispatch={c.dispatchFat} />
                    <DeltaCell receipt={c.receiptSnf} dispatch={c.dispatchSnf} />
                    <DeltaCell receipt={c.receiptWater != null ? String(c.receiptWater) : null} dispatch={c.dispatchWater != null ? String(c.dispatchWater) : null} />
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {meta && meta.totalPages > 1 && (
            <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
              <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: MpConsignment['status'] }) {
  const variant = status === 'received' ? 'success' : status === 'reversed' ? 'danger' : 'default';
  return <Badge variant={variant}>{status.replace('_', ' ')}</Badge>;
}

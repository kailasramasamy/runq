import { useState } from 'react';
import { Droplets, TrendingUp, Users, Coins } from 'lucide-react';
import {
  Card, CardContent, Badge, Combobox, Input, Pagination, StatsCard,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton,
} from '@/components/ui';
import { useNodes, useFarmers, usePours, useQualityBands, useCollectionSummary } from '@/hooks/queries/use-milk-procurement';
import { bandLevel, bandCellClass } from './_quality-bands';

const SHIFTS = [{ value: '', label: 'All shifts' }, { value: 'am', label: 'AM' }, { value: 'pm', label: 'PM' }];
const STATUSES = [{ value: '', label: 'Active (recorded)' }, { value: 'recorded', label: 'Recorded' }, { value: 'reversed', label: 'Reversed' }];
const LIMIT = 50;

export function CollectionHistoryView() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({ nodeId: '', farmerId: '', from: monthAgo, to: today, shift: '', status: '' });
  const [page, setPage] = useState(1);

  const { data: nodesData } = useNodes({ limit: 300 });
  const { data: farmersData } = useFarmers({ limit: 500 });
  const nodes = nodesData?.data ?? [];
  const farmers = farmersData?.data ?? [];
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? '—';
  const farmerName = (id: string) => { const x = farmers.find((y) => y.id === id); return x ? `${x.code} · ${x.name}` : id.slice(0, 8); };

  const { data, isLoading } = usePours({
    nodeId: f.nodeId || undefined,
    farmerId: f.farmerId || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    shift: f.shift || undefined,
    status: (f.status || 'recorded') || undefined,
    page,
    limit: LIMIT,
  });
  const { data: bandsData } = useQualityBands(f.nodeId || undefined);
  const bands = bandsData?.data;
  const pours = data?.data ?? [];
  const meta = data?.meta;
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };
  const qcClass = (val: string | null, band: Parameters<typeof bandLevel>[1]) =>
    val != null ? bandCellClass(bandLevel(Number(val), band)) : '';

  return (
    <div>
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-2 py-4 md:grid-cols-6">
          <Combobox label="VMCC" value={f.nodeId} onChange={(v) => set({ nodeId: v })}
            options={[{ value: '', label: 'All VMCCs' }, ...nodes.filter((n) => n.nodeType === 'vmcc').map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]} placeholder="All VMCCs" />
          <Combobox label="Farmer" value={f.farmerId} onChange={(v) => set({ farmerId: v })}
            options={[{ value: '', label: 'All farmers' }, ...farmers.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))]} placeholder="All farmers" />
          <Input label="From" type="date" value={f.from} max={f.to} onChange={(e) => set({ from: e.target.value })} />
          <Input label="To" type="date" value={f.to} max={today} onChange={(e) => set({ to: e.target.value })} />
          <Combobox label="Shift" value={f.shift} onChange={(v) => set({ shift: v })} options={SHIFTS} />
          <Combobox label="Status" value={f.status} onChange={(v) => set({ status: v })} options={STATUSES} />
        </CardContent>
      </Card>

      <CollectionSummaryCards from={f.from} to={f.to} nodeId={f.nodeId || undefined} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Date</Th><Th>Receipt</Th><Th>VMCC</Th><Th>Farmer</Th><Th>Shift</Th>
                <Th align="right">Qty</Th><Th>FAT/SNF</Th><Th>Water %</Th><Th>Grade</Th><Th align="right">₹/L</Th><Th align="right">₹</Th><Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={8} cols={12} />
              ) : pours.length === 0 ? (
                <TableEmpty colSpan={12} message="No pours for these filters." />
              ) : (
                pours.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs tabular-nums">{p.collectionDate}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{p.receiptNo}</TableCell>
                    <TableCell>{nodeName(p.nodeId)}</TableCell>
                    <TableCell>{farmerName(p.farmerId)}</TableCell>
                    <TableCell>{p.shift.toUpperCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.qtyLitres}</TableCell>
                    <TableCell className="tabular-nums">
                      <span className={qcClass(p.fat, bands?.[p.milkType]?.fat)}>{p.fat ?? '—'}</span>
                      /
                      <span className={qcClass(p.snf, bands?.[p.milkType]?.snf)}>{p.snf ?? '—'}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{p.water ?? '—'}</TableCell>
                    <TableCell><Badge variant={p.qualityGrade === 'a' ? 'success' : 'default'}>{p.qualityGrade?.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{p.ratePerLitre}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.lineAmount}</TableCell>
                    <TableCell>{p.status === 'reversed' ? <Badge variant="danger">reversed</Badge> : <Badge variant="success">recorded</Badge>}</TableCell>
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

/** Period totals for the current filters — folds the old standalone
 * "Collection summary" report into this canonical collection view. */
function CollectionSummaryCards({ from, to, nodeId }: { from: string; to: string; nodeId?: string }) {
  const { data } = useCollectionSummary({ from, to, nodeId });
  const s = data?.data;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatsCard title="Total milk (L)" value={s?.totalQty ?? 0} icon={Droplets} formatValue={(v) => `${v.toLocaleString()} L`} />
      <StatsCard title="AM / PM (L)" value={s?.amQty ?? 0} icon={TrendingUp} formatValue={() => `${s?.amQty ?? 0} / ${s?.pmQty ?? 0}`} />
      <StatsCard title="Farmers" value={s?.farmerCount ?? 0} icon={Users} formatValue={(v) => String(v)} />
      <StatsCard title="Gross value" value={s?.grossAmount ?? 0} icon={Coins} />
    </div>
  );
}

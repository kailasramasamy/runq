import { useState } from 'react';
import { Droplets, TrendingUp, Users, Coins } from 'lucide-react';
import {
  Card, CardContent, Combobox, Input, Pagination, StatsCard,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useNodes, useFarmers, useFarmerDaily, type MpFarmerDayRow } from '@/hooks/queries/use-milk-procurement';
import { Pills, shortDate } from './_node-dashboard-shared';
import { NodeHistoryBody } from './node-history';
import { DailyQtyChart, sumDailyByDate, PAGE_SIZE } from './_daily-history';

type Scope = 'farmer' | 'vmcc' | 'cc';
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'farmer', label: 'Farmers' },
  { value: 'vmcc', label: 'VMCC' },
  { value: 'cc', label: 'Collection centre' },
];

const q1 = (v: number) => (v > 0 ? v.toFixed(1) : '—');
const shiftPair = (am: number, pm: number) => `${q1(am)} / ${q1(pm)}`;

/** Collection history, scoped by who's reading it: a per-farmer daily rollup, or
 * the daily per-VMCC / per-CC rollup (same view, different grouping). */
export function CollectionHistoryView() {
  const [scope, setScope] = useState<Scope>('farmer');
  return (
    <div>
      <div className="mb-4">
        <Pills value={scope} onChange={setScope} options={SCOPES} />
      </div>
      {scope === 'farmer' ? (
        <FarmerHistoryView />
      ) : (
        <NodeHistoryBody groupBy={scope} nodeLabel={scope === 'vmcc' ? 'VMCC' : 'Collection centre'} />
      )}
    </div>
  );
}

/** One row per farmer per day (AM/PM combined), with a daily-volume chart and
 * period summary — all honouring the VMCC / farmer / date filters. */
function FarmerHistoryView() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({ nodeId: '', farmerId: '', from: monthAgo, to: today });
  const [page, setPage] = useState(1);

  const { data: nodesData } = useNodes({ nodeType: 'vmcc', limit: 300 });
  const { data: farmersData } = useFarmers({ limit: 500 });
  const nodes = nodesData?.data ?? [];
  const farmers = farmersData?.data ?? [];
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? '—';
  const farmerName = (id: string) => { const x = farmers.find((y) => y.id === id); return x ? `${x.code} · ${x.name}` : id.slice(0, 8); };

  const { data } = useFarmerDaily({ from: f.from, to: f.to, nodeId: f.nodeId || undefined, farmerId: f.farmerId || undefined });
  const rows = data?.data ?? [];
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(1); };
  const sorted = [...rows].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.totalQty - a.totalQty));

  return (
    <div>
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-2 py-4 md:grid-cols-4">
          <Combobox label="VMCC" value={f.nodeId} onChange={(v) => set({ nodeId: v })}
            options={[{ value: '', label: 'All VMCCs' }, ...nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]} placeholder="All VMCCs" />
          <Combobox label="Farmer" value={f.farmerId} onChange={(v) => set({ farmerId: v })}
            options={[{ value: '', label: 'All farmers' }, ...farmers.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))]} placeholder="All farmers" />
          <Input label="From" type="date" value={f.from} max={f.to} onChange={(e) => set({ from: e.target.value })} />
          <Input label="To" type="date" value={f.to} max={today} onChange={(e) => set({ to: e.target.value })} />
        </CardContent>
      </Card>

      <FarmerSummaryCards rows={rows} />
      <DailyQtyChart rows={sumDailyByDate(rows)} />
      <FarmerDailyTable rows={sorted} page={page} setPage={setPage} nodeName={nodeName} farmerName={farmerName} />
    </div>
  );
}

/** Period totals for the rows currently shown (respects the filters). */
function FarmerSummaryCards({ rows }: { rows: MpFarmerDayRow[] }) {
  const t = rows.reduce(
    (a, r) => ({ qty: a.qty + r.totalQty, am: a.am + r.amQty, pm: a.pm + r.pmQty, gross: a.gross + r.grossAmount }),
    { qty: 0, am: 0, pm: 0, gross: 0 },
  );
  const farmerCount = new Set(rows.map((r) => r.farmerId)).size;
  const fmt1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatsCard title="Total milk (L)" value={t.qty} icon={Droplets} formatValue={(v) => `${fmt1(v)} L`} />
      <StatsCard title="AM / PM (L)" value={t.qty} icon={TrendingUp} formatValue={() => `${fmt1(t.am)} / ${fmt1(t.pm)}`} />
      <StatsCard title="Farmers" value={farmerCount} icon={Users} formatValue={(v) => String(v)} />
      <StatsCard title="Gross value" value={t.gross} icon={Coins} />
    </div>
  );
}

/** Per-(day, farmer) table with AM/PM combined into one line, client-paginated. */
function FarmerDailyTable({ rows, page, setPage, nodeName, farmerName }: {
  rows: MpFarmerDayRow[]; page: number; setPage: (p: number) => void;
  nodeName: (id: string) => string; farmerName: (id: string) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Date</Th>
              <Th>Farmer</Th>
              <Th>VMCC</Th>
              <Th align="right">Qty (L)</Th>
              <Th align="right">AM / PM</Th>
              <Th align="right">FAT AM/PM</Th>
              <Th align="right">SNF AM/PM</Th>
              <Th align="right">Water %</Th>
              <Th align="right">Gross payable</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableEmpty colSpan={9} message="No pours for these filters." />
            ) : (
              pageRows.map((r) => (
                <TableRow key={`${r.date}|${r.farmerId}|${r.nodeId}`}>
                  <TableCell className="tabular-nums">{shortDate(r.date)}</TableCell>
                  <TableCell>{farmerName(r.farmerId)}</TableCell>
                  <TableCell>{nodeName(r.nodeId)}</TableCell>
                  <TableCell align="right" numeric>{r.totalQty.toLocaleString()}</TableCell>
                  <TableCell align="right" numeric>{r.amQty} / {r.pmQty}</TableCell>
                  <TableCell align="right" numeric>{shiftPair(r.amFat, r.pmFat)}</TableCell>
                  <TableCell align="right" numeric>{shiftPair(r.amSnf, r.pmSnf)}</TableCell>
                  <TableCell align="right" numeric>{q1(r.avgWater)}</TableCell>
                  <TableCell align="right" numeric>{formatINR(r.grossAmount)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
            <Pagination page={safePage} totalPages={totalPages} total={rows.length} limit={PAGE_SIZE} onPageChange={setPage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

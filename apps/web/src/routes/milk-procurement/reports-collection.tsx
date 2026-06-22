import { useState } from 'react';
import { Droplets, Users, Coins, FlaskConical, TrendingUp } from 'lucide-react';
import { PageHeader, Card, CardContent, Combobox, Input, StatsCard } from '@/components/ui';
import { useNodes, useCollectionSummary } from '@/hooks/queries/use-milk-procurement';

export function MpCollectionReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState({ from: today, to: today, nodeId: '' });
  const { data: nodesData } = useNodes({ limit: 300 });
  const nodes = nodesData?.data ?? [];
  const { data } = useCollectionSummary({ from: q.from, to: q.to, nodeId: q.nodeId || undefined });
  const s = data?.data;

  return (
    <div>
      <PageHeader title="Collection summary" description="Milk collected over a period, optionally by node." fullWidth />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-2 py-4">
          <div className="w-40"><Input label="From" type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /></div>
          <div className="w-40"><Input label="To" type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></div>
          <div className="w-64"><Combobox label="Node (optional)" value={q.nodeId} onChange={(v) => setQ({ ...q, nodeId: v })}
            options={[{ value: '', label: 'All nodes' }, ...nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]} placeholder="All nodes" /></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Total milk (L)" value={s?.totalQty ?? 0} icon={Droplets} formatValue={(v) => `${v.toLocaleString()} L`} />
        <StatsCard title="AM / PM (L)" value={s?.amQty ?? 0} icon={TrendingUp} formatValue={() => `${s?.amQty ?? 0} / ${s?.pmQty ?? 0}`} />
        <StatsCard title="Farmers" value={s?.farmerCount ?? 0} icon={Users} formatValue={(v) => String(v)} />
        <StatsCard title="Gross value" value={s?.grossAmount ?? 0} icon={Coins} />
        <StatsCard title="Avg FAT" value={s?.avgFat ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
        <StatsCard title="Avg SNF" value={s?.avgSnf ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
        <StatsCard title="Avg Water %" value={s?.avgWater ?? 0} icon={FlaskConical} formatValue={(v) => v > 0 ? v.toFixed(2) : '—'} />
        <StatsCard title="Pours" value={s?.pourCount ?? 0} formatValue={(v) => String(v)} />
      </div>
    </div>
  );
}

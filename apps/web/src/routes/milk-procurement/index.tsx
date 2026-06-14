import { Link } from '@tanstack/react-router';
import { Droplets, Users, Coins, Network, Scale, TrendingUp, FlaskConical } from 'lucide-react';
import { PageHeader, Card, CardContent, StatsCard } from '@/components/ui';
import { useCollectionSummary } from '@/hooks/queries/use-milk-procurement';
import type { LucideIcon } from 'lucide-react';

const ACCENT = '#0F7A5A';

export function MilkProcurementHomePage() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useCollectionSummary({ from: today, to: today });
  const s = data?.data;

  return (
    <div>
      <PageHeader
        title="Milk Procurement"
        description="Dhenu — collection network, farmers, rate charts, and payouts."
        fullWidth
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Milk today (L)" value={s?.totalQty ?? 0} icon={Droplets} formatValue={(v) => `${v.toLocaleString()} L`} />
        <StatsCard title="AM / PM (L)" value={s?.amQty ?? 0} icon={TrendingUp} formatValue={() => `${s?.amQty ?? 0} / ${s?.pmQty ?? 0}`} />
        <StatsCard title="Farmers poured" value={s?.farmerCount ?? 0} icon={Users} formatValue={(v) => String(v)} />
        <StatsCard title="Gross payable" value={s?.grossAmount ?? 0} icon={Coins} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatsCard title="Avg FAT" value={s?.avgFat ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
        <StatsCard title="Avg SNF" value={s?.avgSnf ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
        <StatsCard title="Pours today" value={s?.pourCount ?? 0} formatValue={(v) => String(v)} />
      </div>

      <h2 className="mt-7 mb-3 text-sm font-semibold text-zinc-500">Manage</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <QuickLink to="/milk-procurement/collection" icon={Droplets} label="Record collection" desc="Capture farmer pours" />
        <QuickLink to="/milk-procurement/personas" icon={Users} label="View as persona" desc="Act as farmer / VMCC / CC / PP" />
        <QuickLink to="/milk-procurement/nodes" icon={Network} label="Network" desc="VMCC, CC, PP" />
        <QuickLink to="/milk-procurement/farmers" icon={Users} label="Farmers" desc="Master + KYC" />
        <QuickLink to="/milk-procurement/rate-charts" icon={Scale} label="Rate charts" desc="FAT/SNF matrix or flat" />
        <QuickLink to="/milk-procurement/payouts" icon={Coins} label="Payouts" desc="Cycles + farmer ledger" />
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, desc }: { to: string; icon: LucideIcon; label: string; desc: string }) {
  return (
    <Link to={to} className="block">
      <Card className="h-full transition hover:border-emerald-300 hover:shadow-sm">
        <CardContent className="flex items-center gap-3 py-4">
          <span className="rounded-lg p-2" style={{ background: `${ACCENT}15`, color: ACCENT }}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</div>
            <div className="text-xs text-zinc-500">{desc}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

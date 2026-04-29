import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Building2, CreditCard, Users, TrendingUp, Megaphone } from 'lucide-react';
import { Card, CardHeader, CardContent, StatsCard, PageHeader, Skeleton, Badge } from '@/components/ui';
import { api } from '@/lib/api-client';

interface BillingOverview {
  mrrCents: number;
  arrCents: number;
  activeSubs: number;
  trialingSubs: number;
  churned30: number;
  activeTenants: number;
}

interface FunnelRow { stage: string; count: number }
interface ModuleRow { module: string; tenants: number }
interface SignupsRow { month: string; signups: number }

const STAGE_LABEL: Record<string, string> = {
  signed_up: 'Signed up',
  has_user: 'Has a user',
  has_invoice: 'First invoice',
  paying: 'Paying',
};

const MODULE_LABEL: Record<string, string> = {
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  banking: 'Banking',
  gst: 'GST Filing',
  fa: 'Fixed Assets',
};

export function AdminOverviewPage() {
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [signups, setSignups] = useState<SignupsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ data: BillingOverview }>('/admin/billing/overview'),
      api.get<{ data: FunnelRow[] }>('/admin/analytics/funnel'),
      api.get<{ data: ModuleRow[] }>('/admin/analytics/modules'),
      api.get<{ data: SignupsRow[] }>('/admin/analytics/signups'),
    ])
      .then(([b, f, m, s]) => {
        setBilling(b.data);
        setFunnel(f.data);
        setModules(m.data);
        setSignups(s.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSignups = funnel.find((r) => r.stage === 'signed_up')?.count ?? 0;
  const maxSignupsMonth = Math.max(1, ...signups.map((s) => s.signups));

  return (
    <div className="space-y-6">
      <PageHeader title="Platform Overview" description="At-a-glance health of the runQ platform" />

      {loading || !billing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="MRR" value={billing.mrrCents / 100} icon={TrendingUp} formatValue={(v) => `₹${v.toLocaleString('en-IN')}`} />
          <StatsCard title="Active tenants" value={billing.activeTenants} icon={Building2} formatValue={(v) => String(v)} />
          <StatsCard title="Active subs" value={billing.activeSubs} icon={CreditCard} formatValue={(v) => String(v)} />
          <StatsCard title="Trialing" value={billing.trialingSubs} icon={Users} formatValue={(v) => String(v)} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Activation funnel</h2>
            <p className="text-xs text-zinc-500">From signup to paying customer</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.length === 0 ? <Skeleton className="h-24 w-full" /> :
              funnel.map((r) => {
                const pct = totalSignups > 0 ? Math.round((r.count / totalSignups) * 100) : 0;
                return (
                  <div key={r.stage}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{STAGE_LABEL[r.stage] ?? r.stage}</span>
                      <span className="font-mono tabular-nums">{r.count} <span className="text-zinc-500">({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Module adoption</h2>
            <p className="text-xs text-zinc-500">Tenants who have used each module at least once</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {modules.length === 0 ? <Skeleton className="h-24 w-full" /> :
              modules.map((r) => {
                const pct = totalSignups > 0 ? Math.round((r.tenants / totalSignups) * 100) : 0;
                return (
                  <div key={r.module} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex-1">{MODULE_LABEL[r.module] ?? r.module}</span>
                    <div className="w-32 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono tabular-nums w-16 text-right">{r.tenants} <span className="text-zinc-500 text-xs">({pct}%)</span></span>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-base font-semibold">Signups (last 12 months)</h2>
          </CardHeader>
          <CardContent>
            {signups.length === 0 ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="flex items-end gap-2 h-32">
                {signups.map((s) => {
                  const h = Math.max(4, Math.round((s.signups / maxSignupsMonth) * 100));
                  return (
                    <div key={s.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full bg-indigo-500 rounded-t" style={{ height: `${h}%` }} title={`${s.month}: ${s.signups}`} />
                      <span className="text-[10px] text-zinc-500 truncate w-full text-center">{s.month.slice(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-4 flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-indigo-500 shrink-0" />
          <p className="text-sm flex-1">Need to push a banner to all tenants? Use{' '}
            <Link to="/admin/announcements" className="text-indigo-600 hover:underline dark:text-indigo-400">Announcements</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

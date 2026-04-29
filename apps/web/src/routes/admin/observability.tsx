import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Activity, AlertTriangle, Brain, Banknote } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  StatsCard,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Badge,
} from '@/components/ui';
import { api } from '@/lib/api-client';

interface Snapshot {
  aiExtractionSuccessRate: number | null;
  aiExtractionSamples: number;
  reconBacklog30d: number;
  activeTenants: number;
  staleTenants14d: number;
  timestamp: string;
}

interface AtRiskRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  mrr_cents: number;
  last_active_at: string | null;
  days_inactive: number;
}

export function AdminObservabilityPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Snapshot }>('/admin/observability/snapshot'),
      api.get<{ data: AtRiskRow[] }>('/admin/observability/at-risk'),
    ])
      .then(([s, r]) => {
        setSnap(s.data);
        setAtRisk(r.data);
      })
      .catch(() => {
        setSnap(null);
        setAtRisk([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Observability"
        description={snap ? `Last refreshed ${new Date(snap.timestamp).toLocaleTimeString()}` : 'System health & at-risk tenants'}
      />

      {loading || !snap ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="AI extraction (7d)"
            value={snap.aiExtractionSuccessRate ?? 0}
            icon={Brain}
            formatValue={(v) => snap.aiExtractionSuccessRate === null ? '—' : `${v}%`}
          />
          <StatsCard title="Recon backlog (30d)" value={snap.reconBacklog30d} icon={Banknote} formatValue={(v) => String(v)} />
          <StatsCard title="Active tenants" value={snap.activeTenants} icon={Activity} formatValue={(v) => String(v)} />
          <StatsCard title="Stale tenants (14d)" value={snap.staleTenants14d} icon={AlertTriangle} formatValue={(v) => String(v)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">At-risk tenants</h2>
          <p className="text-xs text-zinc-500">Active or trialing tenants with no login in the last 7+ days, by inactivity.</p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : atRisk.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No at-risk tenants. Healthy state 🎉</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Tenant</Th>
                  <Th>Status</Th>
                  <Th>MRR</Th>
                  <Th>Last active</Th>
                  <Th>Days inactive</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atRisk.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link to="/admin/tenants/$tenantId" params={{ tenantId: t.id }} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        {t.name}
                      </Link>
                      <div className="text-xs font-mono text-zinc-500">{t.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'trial' ? 'warning' : 'success'}>{t.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {t.mrr_cents ? `₹${(t.mrr_cents / 100).toLocaleString('en-IN')}` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {t.last_active_at ? new Date(t.last_active_at).toLocaleDateString() : 'never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.days_inactive > 30 ? 'danger' : t.days_inactive > 14 ? 'warning' : 'default'}>
                        {t.days_inactive}d
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

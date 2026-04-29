import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, ShieldOff, RotateCw, Clock, Save, CreditCard, Trash2 } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Skeleton,
  Badge,
  Button,
  StatsCard,
  Textarea,
  Modal,
  Input,
  Combobox,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api-client';

interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  interval: 'monthly' | 'yearly';
  isActive: boolean;
}

type SubStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

interface Subscription {
  id: string;
  planId: string;
  planName: string | null;
  planCode: string | null;
  priceCents: number | null;
  interval: 'monthly' | 'yearly' | null;
  status: SubStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  razorpaySubscriptionId: string | null;
}

const SUB_STATUS_BADGE: Record<SubStatus, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  cancelled: 'default',
  expired: 'default',
};

const SUB_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

type TenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'churned';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  planId: string | null;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  mrrCents: number;
  lastActiveAt: string | null;
  createdAt: string;
  notes: string | null;
}

interface DetailResponse {
  data: { tenant: Tenant; stats: { userCount: number } };
}

const STATUS_BADGE: Record<TenantStatus, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  trial: { variant: 'warning', label: 'Trial' },
  active: { variant: 'success', label: 'Active' },
  past_due: { variant: 'warning', label: 'Past due' },
  suspended: { variant: 'danger', label: 'Suspended' },
  churned: { variant: 'default', label: 'Churned' },
};

export function AdminTenantDetailPage({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<DetailResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const reload = () => {
    setLoading(true);
    api
      .get<DetailResponse>(`/admin/tenants/${tenantId}`)
      .then((res) => {
        setData(res.data);
        setNotes(res.data.tenant.notes ?? '');
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const onSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.patch(`/admin/tenants/${tenantId}`, { notes });
      toast('Notes saved', 'success');
    } catch {
      toast('Failed to save', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const impersonate = async () => {
    if (!data) return;
    try {
      const res = await api.post<{ data: { token: string } }>(`/admin/tenants/${tenantId}/impersonate`, {});
      const platformToken = localStorage.getItem('runq-token');
      if (platformToken) localStorage.setItem('runq-platform-token', platformToken);
      localStorage.setItem('runq-token', res.data.token);
      localStorage.setItem(
        'runq-impersonation-active',
        JSON.stringify({ tenantName: data.tenant.name, tenantSlug: data.tenant.slug }),
      );
      window.location.href = (import.meta.env.BASE_URL ?? '/');
    } catch {
      toast('Failed to start impersonation', 'error');
    }
  };

  const suspend = async () => {
    const reason = window.prompt('Reason for suspension?');
    if (!reason) return;
    await api.post(`/admin/tenants/${tenantId}/suspend`, { reason });
    toast('Suspended', 'success');
    reload();
  };

  const reactivate = async () => {
    await api.post(`/admin/tenants/${tenantId}/reactivate`, {});
    toast('Reactivated', 'success');
    reload();
  };

  const extendTrial = async () => {
    const raw = window.prompt('Extend trial by how many days?', '14');
    if (!raw) return;
    const days = parseInt(raw, 10);
    if (!Number.isFinite(days) || days <= 0) return;
    await api.post(`/admin/tenants/${tenantId}/extend-trial`, { days });
    toast(`Extended by ${days} days`, 'success');
    reload();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-10 text-center text-sm text-zinc-500">Tenant not found.</div>;
  }

  const { tenant, stats } = data;
  const badge = STATUS_BADGE[tenant.status];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/tenants" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          <ArrowLeft className="h-4 w-4" /> All tenants
        </Link>
      </div>

      <PageHeader
        title={tenant.name}
        titleBadge={<Badge variant={badge.variant}>{badge.label}</Badge>}
        description={tenant.slug}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={impersonate}>
              <ExternalLink className="h-4 w-4" /> Impersonate
            </Button>
            {tenant.status !== 'churned' && (
              <Button variant="secondary" size="sm" onClick={extendTrial}>
                <Clock className="h-4 w-4" /> Extend trial
              </Button>
            )}
            {tenant.status === 'suspended' ? (
              <Button variant="secondary" size="sm" onClick={reactivate}>
                <RotateCw className="h-4 w-4" /> Reactivate
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={suspend}>
                <ShieldOff className="h-4 w-4" /> Suspend
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="MRR"
          value={tenant.mrrCents / 100}
          formatValue={(v) => `₹${v.toLocaleString('en-IN')}`}
        />
        <StatsCard title="Active Users" value={stats.userCount} formatValue={(v) => String(v)} />
        <StatsCard
          title="Created"
          value={Math.floor((Date.now() - new Date(tenant.createdAt).getTime()) / 86_400_000)}
          formatValue={(v) => `${v} days ago`}
        />
        <StatsCard
          title="Last Active"
          value={tenant.lastActiveAt ? Math.floor((Date.now() - new Date(tenant.lastActiveAt).getTime()) / 86_400_000) : 0}
          formatValue={(v) => (tenant.lastActiveAt ? `${v} days ago` : '—')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SubscriptionCard tenantId={tenantId} tenant={tenant} onChange={reload} />

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Internal Notes</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Notes visible only to platform staff…" />
            <Button size="sm" onClick={onSaveNotes} loading={savingNotes}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatINR(cents: number): string {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function SubscriptionCard({
  tenantId,
  tenant,
  onChange,
}: {
  tenantId: string;
  tenant: Tenant;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ data: Subscription | null }>(`/admin/billing/tenants/${tenantId}/subscription`)
      .then((r) => setSub(r.data))
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tenantId]);

  const cancel = async () => {
    if (!window.confirm(`Cancel ${tenant.name}'s subscription? MRR will drop to zero and tenant will be churned.`)) return;
    try {
      await api.delete(`/admin/billing/tenants/${tenantId}/subscription`);
      toast('Subscription cancelled', 'success');
      load();
      onChange();
    } catch {
      toast('Failed', 'error');
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-indigo-500" />
            <h2 className="text-base font-semibold">Subscription</h2>
          </div>
          <div className="flex gap-2">
            {sub && sub.status !== 'cancelled' && (
              <Button variant="ghost" size="sm" onClick={cancel}>
                <Trash2 className="h-4 w-4" /> Cancel
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowModal(true)}>
              {sub ? 'Manage' : 'Attach plan'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : !sub ? (
          <div className="py-6 text-center text-sm text-zinc-500">
            No active subscription. Click <strong>Attach plan</strong> to manually assign one.
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-zinc-500">Plan</dt>
            <dd className="font-medium">
              {sub.planName} <span className="font-mono text-xs text-zinc-500">({sub.planCode})</span>
            </dd>
            <dt className="text-zinc-500">Price</dt>
            <dd>
              {sub.priceCents !== null ? formatINR(sub.priceCents) : '—'}
              {sub.interval && <span className="text-zinc-500 text-xs"> / {sub.interval === 'monthly' ? 'mo' : 'yr'}</span>}
            </dd>
            <dt className="text-zinc-500">Status</dt>
            <dd>
              <Badge variant={SUB_STATUS_BADGE[sub.status]}>{sub.status}</Badge>
            </dd>
            <dt className="text-zinc-500">Period</dt>
            <dd className="text-xs">
              {sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString() : '—'}
              {' → '}
              {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
            </dd>
            {sub.razorpaySubscriptionId && (
              <>
                <dt className="text-zinc-500">Razorpay</dt>
                <dd className="font-mono text-xs">{sub.razorpaySubscriptionId}</dd>
              </>
            )}
            {tenant.trialEndsAt && (
              <>
                <dt className="text-zinc-500">Trial ends</dt>
                <dd>{new Date(tenant.trialEndsAt).toLocaleDateString()}</dd>
              </>
            )}
          </dl>
        )}
      </CardContent>

      {showModal && (
        <SubscriptionModal
          tenantId={tenantId}
          existing={sub}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
            onChange();
          }}
        />
      )}
    </Card>
  );
}

function SubscriptionModal({
  tenantId,
  existing,
  onClose,
  onSaved,
}: {
  tenantId: string;
  existing: Subscription | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState(existing?.planId ?? '');
  const [status, setStatus] = useState<SubStatus>(existing?.status ?? 'active');
  const [periodStart, setPeriodStart] = useState(
    existing?.currentPeriodStart ? existing.currentPeriodStart.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [periodEnd, setPeriodEnd] = useState(
    existing?.currentPeriodEnd ? existing.currentPeriodEnd.slice(0, 10) : '',
  );
  const [razorpayId, setRazorpayId] = useState(existing?.razorpaySubscriptionId ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ data: Plan[] }>('/admin/billing/plans')
      .then((r) => {
        const active = r.data.filter((p) => p.isActive);
        setPlans(active);
        if (!planId && active[0]) setPlanId(active[0].id);
      })
      .catch(() => setPlans([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planOptions = plans.map((p) => ({
    value: p.id,
    label: `${p.name} — ${formatINR(p.priceCents)}/${p.interval === 'monthly' ? 'mo' : 'yr'}`,
  }));

  // When the user picks a plan, auto-suggest a period end if blank.
  useEffect(() => {
    if (!periodEnd && planId) {
      const plan = plans.find((p) => p.id === planId);
      if (plan && periodStart) {
        const start = new Date(`${periodStart}T00:00:00`);
        const end = new Date(start.getTime() + (plan.interval === 'yearly' ? 365 : 30) * 86_400_000);
        setPeriodEnd(end.toISOString().slice(0, 10));
      }
    }
  }, [planId, periodStart, plans, periodEnd]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) {
      toast('Pick a plan', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/admin/billing/tenants/${tenantId}/subscription`, {
        planId,
        status,
        currentPeriodStart: periodStart ? new Date(`${periodStart}T00:00:00`).toISOString() : null,
        currentPeriodEnd: periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null,
        razorpaySubscriptionId: razorpayId.trim() || null,
      });
      toast('Subscription saved', 'success');
      onSaved();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={existing ? 'Manage subscription' : 'Attach plan'} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <Combobox label="Plan" options={planOptions} value={planId} onChange={setPlanId} required />
        <Combobox label="Status" options={SUB_STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as SubStatus)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Current period start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
          <Input label="Current period end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
        </div>
        <Input
          label="Razorpay subscription ID (optional)"
          value={razorpayId}
          onChange={(e) => setRazorpayId(e.target.value)}
          placeholder="sub_XXXXXXXXX"
        />
        <p className="text-xs text-zinc-500">
          Tenant's <code>plan_id</code>, <code>mrr_cents</code>, and lifecycle status are kept in sync automatically.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{existing ? 'Save' : 'Attach'}</Button>
        </div>
      </form>
    </Modal>
  );
}

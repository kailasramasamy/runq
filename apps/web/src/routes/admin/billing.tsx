import { useEffect, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { TrendingUp, Users, AlertTriangle, Building2, Plus, Edit2 } from 'lucide-react';
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
  Button,
  Modal,
  Input,
  Textarea,
  Combobox,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api-client';

interface OverviewData {
  mrrCents: number;
  arrCents: number;
  activeSubs: number;
  trialingSubs: number;
  churned30: number;
  activeTenants: number;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  interval: 'monthly' | 'yearly';
  modules: string[];
  features: Record<string, unknown>;
  razorpayPlanId: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface SubRow {
  id: string;
  tenantId: string;
  tenantName: string | null;
  planName: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  razorpaySubscriptionId: string | null;
}

interface InvoiceRow {
  id: string;
  tenantId: string;
  tenantName: string | null;
  number: string;
  totalCents: number;
  status: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

const TABS = [
  { label: 'Overview', path: '/admin/billing' },
  { label: 'Plans', path: '/admin/billing/plans' },
  { label: 'Subscriptions', path: '/admin/billing/subscriptions' },
  { label: 'Invoices', path: '/admin/billing/invoices' },
];

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default' | 'info'; label: string }> = {
  trialing: { variant: 'info', label: 'Trial' },
  active: { variant: 'success', label: 'Active' },
  past_due: { variant: 'warning', label: 'Past due' },
  cancelled: { variant: 'default', label: 'Cancelled' },
  expired: { variant: 'default', label: 'Expired' },
  draft: { variant: 'default', label: 'Draft' },
  issued: { variant: 'info', label: 'Issued' },
  paid: { variant: 'success', label: 'Paid' },
  failed: { variant: 'danger', label: 'Failed' },
  refunded: { variant: 'warning', label: 'Refunded' },
};

function formatINR(cents: number): string {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function BillingTabs() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="flex gap-1">
        {TABS.map(({ label, path }) => {
          const isActive = path === '/admin/billing' ? current === '/admin/billing' || current === '/admin/billing/' : current.startsWith(path);
          return (
            <Link
              key={path}
              to={path as '/admin/billing'}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
              ].join(' ')}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AdminBillingPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: OverviewData }>('/admin/billing/overview')
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="MRR, plans, subscriptions, invoices" />
      <BillingTabs />
      {loading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="MRR" value={data.mrrCents / 100} icon={TrendingUp} formatValue={(v) => `₹${v.toLocaleString('en-IN')}`} />
            <StatsCard title="ARR" value={data.arrCents / 100} icon={TrendingUp} formatValue={(v) => `₹${v.toLocaleString('en-IN')}`} />
            <StatsCard title="Active subs" value={data.activeSubs} icon={Users} formatValue={(v) => String(v)} />
            <StatsCard title="Churned (30d)" value={data.churned30} icon={AlertTriangle} formatValue={(v) => String(v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatsCard title="Active tenants" value={data.activeTenants} icon={Building2} formatValue={(v) => String(v)} />
            <StatsCard title="Trialing subs" value={data.trialingSubs} icon={Users} formatValue={(v) => String(v)} />
          </div>
        </>
      )}
    </div>
  );
}

const ALL_MODULES = ['ar', 'ap', 'banking', 'gst', 'fa', 'hr', 'integrations', 'ca-portal', 'reports', 'workflows', 'vendor-management'];

const MODULE_LABEL: Record<string, string> = {
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  banking: 'Banking',
  gst: 'GST Filing',
  fa: 'Fixed Assets',
  hr: 'HR / Expense Claims',
  integrations: 'Integrations',
  'ca-portal': 'CA Portal',
  reports: 'Reports',
  workflows: 'Workflows',
  'vendor-management': 'Vendor Management',
};

const INTERVAL_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export function AdminBillingPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    setLoading(true);
    api
      .get<{ data: Plan[] }>('/admin/billing/plans')
      .then((r) => setPlans(r.data))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const toggleActive = async (p: Plan) => {
    try {
      await api.patch(`/admin/billing/plans/${p.id}`, { isActive: !p.isActive });
      toast(p.isActive ? 'Plan deactivated' : 'Plan activated', 'success');
      reload();
    } catch {
      toast('Failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="MRR, plans, subscriptions, invoices"
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New plan
          </Button>
        }
      />
      <BillingTabs />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className={p.isActive ? '' : 'opacity-60'}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold truncate">{p.name}</h3>
                    <div className="text-xs font-mono text-zinc-500">{p.code}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} title="Edit plan">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-2xl font-semibold tabular-nums">{formatINR(p.priceCents)}</span>
                  <span className="ml-1 text-sm text-zinc-500">/{p.interval === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
                {p.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{p.description}</p>}
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Modules</div>
                  <div className="flex flex-wrap gap-1">
                    {p.modules.length === 0 ? (
                      <span className="text-xs text-zinc-400">— none —</span>
                    ) : (
                      p.modules.map((m) => (
                        <Badge key={m} variant="primary">{m}</Badge>
                      ))
                    )}
                  </div>
                </div>
                {Object.keys(p.features).length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Features</div>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
                      {Object.entries(p.features).map(([k, v]) => (
                        <li key={k}>
                          <span className="font-mono text-zinc-500">{k}:</span> {String(v)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {p.razorpayPlanId && (
                  <div className="text-xs text-zinc-500">
                    Razorpay: <code className="text-[10px]">{p.razorpayPlanId}</code>
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <Button size="sm" variant="secondary" onClick={() => toggleActive(p)}>
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(editing || showCreate) && (
        <PlanModal
          existing={editing}
          onClose={() => {
            setEditing(null);
            setShowCreate(false);
          }}
          onSaved={() => {
            setEditing(null);
            setShowCreate(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function PlanModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState(existing?.code ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [priceRupees, setPriceRupees] = useState(existing ? String(existing.priceCents / 100) : '');
  const [interval, setIntervalValue] = useState<'monthly' | 'yearly'>(existing?.interval ?? 'monthly');
  const [modules, setModules] = useState<string[]>(existing?.modules ?? []);
  const [featuresJson, setFeaturesJson] = useState(
    existing ? JSON.stringify(existing.features, null, 2) : '{\n  "users": 5,\n  "storage_gb": 10\n}',
  );
  const [razorpayPlanId, setRazorpayPlanId] = useState(existing?.razorpayPlanId ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(existing ? String(existing.sortOrder) : '0');
  const [saving, setSaving] = useState(false);

  const toggleModule = (m: string) => {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let features: Record<string, unknown>;
    try {
      features = JSON.parse(featuresJson || '{}');
      if (typeof features !== 'object' || Array.isArray(features) || features === null) {
        throw new Error('Features must be a JSON object');
      }
    } catch (err) {
      toast(`Invalid features JSON: ${err instanceof Error ? err.message : 'parse error'}`, 'error');
      return;
    }

    const priceCents = Math.round(parseFloat(priceRupees) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      toast('Price must be a positive number', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        priceCents,
        interval,
        modules,
        features,
        razorpayPlanId: razorpayPlanId.trim() || null,
        isActive,
        sortOrder: parseInt(sortOrder, 10) || 0,
      };

      if (existing) {
        // Code is immutable on edit (it's the stable identifier).
        const { code: _omit, ...rest } = payload;
        await api.patch(`/admin/billing/plans/${existing.id}`, rest);
      } else {
        await api.post('/admin/billing/plans', payload);
      }
      toast('Plan saved', 'success');
      onSaved();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={existing ? `Edit plan: ${existing.name}` : 'New plan'} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. starter, pro"
            required
            disabled={!!existing}
          />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Short description shown to admins (and later, on the pricing page)"
        />

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Price (₹)"
            type="number"
            min="0"
            step="0.01"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            required
          />
          <Combobox
            label="Billing interval"
            options={INTERVAL_OPTIONS}
            value={interval}
            onChange={(v) => setIntervalValue(v as 'monthly' | 'yearly')}
          />
          <Input label="Sort order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Modules included</label>
          <div className="grid grid-cols-2 gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 p-3">
            {ALL_MODULES.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={modules.includes(m)}
                  onChange={() => toggleModule(m)}
                  className="h-4 w-4 rounded"
                />
                <span>{MODULE_LABEL[m] ?? m}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Feature limits (JSON)</label>
          <p className="text-xs text-zinc-500">
            Free-form JSON object. Use <code>-1</code> for unlimited. Common keys: <code>users</code>,{' '}
            <code>storage_gb</code>, <code>ai_extractions</code>, <code>priority_support</code>.
          </p>
          <textarea
            value={featuresJson}
            onChange={(e) => setFeaturesJson(e.target.value)}
            rows={6}
            className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            spellCheck={false}
          />
        </div>

        <Input
          label="Razorpay plan ID (optional)"
          value={razorpayPlanId}
          onChange={(e) => setRazorpayPlanId(e.target.value)}
          placeholder="plan_XXXXXXXXX"
        />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded" />
          Plan is active (selectable for new subscriptions)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{existing ? 'Save changes' : 'Create plan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function AdminBillingSubscriptionsPage() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: { rows: SubRow[] } }>('/admin/billing/subscriptions')
      .then((r) => setRows(r.data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="MRR, plans, subscriptions, invoices" />
      <BillingTabs />
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No subscriptions yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Tenant</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th>Period</Th>
                  <Th>Razorpay</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const badge = STATUS_BADGE[s.status] ?? { variant: 'default' as const, label: s.status };
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link to="/admin/tenants/$tenantId" params={{ tenantId: s.tenantId }} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                          {s.tenantName ?? s.tenantId}
                        </Link>
                      </TableCell>
                      <TableCell>{s.planName ?? '—'}</TableCell>
                      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {s.currentPeriodStart ? new Date(s.currentPeriodStart).toLocaleDateString() : '—'}
                        {' → '}
                        {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500">{s.razorpaySubscriptionId ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminBillingInvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: { rows: InvoiceRow[] } }>('/admin/billing/invoices')
      .then((r) => setRows(r.data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="MRR, plans, subscriptions, invoices" />
      <BillingTabs />
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No invoices yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Number</Th>
                  <Th>Tenant</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>Issued</Th>
                  <Th>Paid</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => {
                  const badge = STATUS_BADGE[inv.status] ?? { variant: 'default' as const, label: inv.status };
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                      <TableCell>
                        <Link to="/admin/tenants/$tenantId" params={{ tenantId: inv.tenantId }} className="text-indigo-600 hover:underline dark:text-indigo-400">
                          {inv.tenantName ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{formatINR(inv.totalCents)}</TableCell>
                      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                      <TableCell className="text-xs text-zinc-500">{inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-xs text-zinc-500">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

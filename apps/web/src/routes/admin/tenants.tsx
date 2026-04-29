import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Search, MoreHorizontal, ExternalLink, ShieldOff, RotateCw, Clock } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Skeleton,
  Pagination,
  Combobox,
  Badge,
  Button,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui';

type TenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'churned';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  planId: string | null;
  planName: string | null;
  planCode: string | null;
  mrrCents: number;
  trialEndsAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}

interface ListResponse {
  data: { rows: TenantRow[]; total: number; limit: number; offset: number };
}

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'churned', label: 'Churned' },
];

const STATUS_BADGE: Record<TenantStatus, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  trial: { variant: 'warning', label: 'Trial' },
  active: { variant: 'success', label: 'Active' },
  past_due: { variant: 'warning', label: 'Past due' },
  suspended: { variant: 'danger', label: 'Suspended' },
  churned: { variant: 'default', label: 'Churned' },
};

function formatINR(cents: number): string {
  if (!cents) return '—';
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

export function AdminTenantsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce search
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String((page - 1) * PAGE_SIZE));
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (status) params.set('status', status);
    return params.toString();
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ListResponse>(`/admin/tenants?${queryString}`)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data.rows);
        setTotal(res.data.total);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryString, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const impersonate = async (t: TenantRow) => {
    try {
      const res = await api.post<{ data: { token: string } }>(`/admin/tenants/${t.id}/impersonate`, {});
      // Stash the platform token so we can come back; replace active token with impersonation token.
      const platformToken = localStorage.getItem('runq-token');
      if (platformToken) localStorage.setItem('runq-platform-token', platformToken);
      localStorage.setItem('runq-token', res.data.token);
      localStorage.setItem(
        'runq-impersonation-active',
        JSON.stringify({ tenantName: t.name, tenantSlug: t.slug }),
      );
      window.location.href = (import.meta.env.BASE_URL ?? '/');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to start impersonation';
      toast(msg, 'error');
    }
  };

  const suspend = async (t: TenantRow) => {
    const reason = window.prompt(`Suspend ${t.name}? Provide a reason:`);
    if (!reason) return;
    try {
      await api.post(`/admin/tenants/${t.id}/suspend`, { reason });
      toast(`Suspended ${t.name}`, 'success');
      refresh();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    }
  };

  const reactivate = async (t: TenantRow) => {
    try {
      await api.post(`/admin/tenants/${t.id}/reactivate`, {});
      toast(`Reactivated ${t.name}`, 'success');
      refresh();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    }
  };

  const extendTrial = async (t: TenantRow) => {
    const raw = window.prompt(`Extend trial for ${t.name} by how many days?`, '14');
    if (!raw) return;
    const days = parseInt(raw, 10);
    if (!Number.isFinite(days) || days <= 0) return;
    try {
      await api.post(`/admin/tenants/${t.id}/extend-trial`, { days });
      toast(`Trial extended by ${days} days`, 'success');
      refresh();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Tenants" description={`${total} tenant${total === 1 ? '' : 's'} on the platform`} />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or slug…"
            className="block w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 py-2 text-sm placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
        <div className="w-full sm:w-56">
          <Combobox
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            placeholder="Status"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No tenants match your filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Plan</Th>
                  <Th>MRR</Th>
                  <Th>Last active</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Actions</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const badge = STATUS_BADGE[t.status];
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link
                          to="/admin/tenants/$tenantId"
                          params={{ tenantId: t.id }}
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {t.name}
                        </Link>
                        <div className="text-xs text-zinc-500 font-mono">{t.slug}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {t.planName ? (
                          <Badge variant="primary">{t.planName}</Badge>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{formatINR(t.mrrCents)}</TableCell>
                      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{relativeTime(t.lastActiveAt)}</TableCell>
                      <TableCell className="text-xs text-zinc-500">{new Date(t.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <RowActions
                          tenant={t}
                          onImpersonate={() => impersonate(t)}
                          onSuspend={() => suspend(t)}
                          onReactivate={() => reactivate(t)}
                          onExtendTrial={() => extendTrial(t)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={Math.ceil(total / PAGE_SIZE)}
          total={total}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function RowActions({
  tenant,
  onImpersonate,
  onSuspend,
  onReactivate,
  onExtendTrial,
}: {
  tenant: TenantRow;
  onImpersonate: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onExtendTrial: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onImpersonate} title="Impersonate">
        <ExternalLink className="h-4 w-4" />
      </Button>
      <div className="relative">
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} title="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        {open && (
          <>
            <button type="button" onClick={() => setOpen(false)} className="fixed inset-0 z-10" tabIndex={-1} aria-hidden="true" />
            <div className="absolute right-0 mt-1 z-20 w-48 rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onExtendTrial();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Clock className="h-4 w-4" /> Extend trial
              </button>
              {tenant.status === 'suspended' ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onReactivate();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <RotateCw className="h-4 w-4" /> Reactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSuspend();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <ShieldOff className="h-4 w-4" /> Suspend
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

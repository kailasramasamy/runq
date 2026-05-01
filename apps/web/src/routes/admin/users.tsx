import { useEffect, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Search, KeyRound, UserX, UserCheck, Plus } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Badge,
  Button,
  Combobox,
  Modal,
  Input,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api-client';

interface TenantUserRow {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'accountant' | 'viewer';
  isActive: boolean;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  createdAt: string;
}

interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'support' | 'billing_ops' | 'read_only';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const TABS = [
  { label: 'Tenant Users', path: '/admin/users' },
  { label: 'Platform Team', path: '/admin/users/platform' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'owner', label: 'Owner' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'viewer', label: 'Viewer' },
];

const PLATFORM_ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'support', label: 'Support' },
  { value: 'billing_ops', label: 'Billing Ops' },
  { value: 'read_only', label: 'Read Only' },
];

function UsersTabs() {
  const routerState = useRouterState();
  const current = routerState.location.pathname;
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="flex gap-1">
        {TABS.map(({ label, path }) => {
          const isActive = path === '/admin/users' ? current === '/admin/users' || current === '/admin/users/' : current.startsWith(path);
          return (
            <Link
              key={path}
              to={path as '/admin/users'}
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

export function AdminUsersPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<TenantUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (role) params.set('role', role);
    api
      .get<{ data: { rows: TenantUserRow[] } }>(`/admin/tenant-users?${params}`)
      .then((r) => setRows(r.data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [debouncedSearch, role, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const resetPassword = async (u: TenantUserRow) => {
    if (!window.confirm(`Reset password for ${u.email}? They will need a new login.`)) return;
    try {
      const res = await api.post<{ data: { tempPassword: string } }>(`/admin/tenant-users/${u.id}/reset-password`, {});
      window.prompt(`Temporary password for ${u.email} (copy now):`, res.data.tempPassword);
      toast('Password reset', 'success');
    } catch {
      toast('Failed', 'error');
    }
  };

  const toggleActive = async (u: TenantUserRow) => {
    try {
      await api.post(`/admin/tenant-users/${u.id}/toggle-active`, {});
      toast(u.isActive ? 'User deactivated' : 'User activated', 'success');
      refresh();
    } catch {
      toast('Failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="All tenant users + platform team" />
      <UsersTabs />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name…"
            className="block w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="w-full sm:w-56">
          <Combobox options={ROLE_OPTIONS} value={role} onChange={setRole} placeholder="Role" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No users match your filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>User</Th>
                  <Th>Tenant</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-zinc-500">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Link to="/admin/tenants/$tenantId" params={{ tenantId: u.tenantId }} className="text-indigo-600 hover:underline dark:text-indigo-400">
                        {u.tenantName ?? '—'}
                      </Link>
                      <div className="text-xs font-mono text-zinc-500">{u.tenantSlug ?? ''}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="primary">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => resetPassword(u)} title="Reset password">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(u)} title={u.isActive ? 'Deactivate' : 'Activate'}>
                          {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                      </div>
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

export function AdminPlatformUsersPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ data: PlatformUser[] }>('/admin/platform-users')
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  const [resetUser, setResetUser] = useState<PlatformUser | null>(null);

  const toggleActive = async (u: PlatformUser) => {
    try {
      await api.patch(`/admin/platform-users/${u.id}`, { isActive: !u.isActive });
      toast(u.isActive ? 'Deactivated' : 'Activated', 'success');
      refresh();
    } catch {
      toast('Failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="All tenant users + platform team"
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add platform user
          </Button>
        }
      />
      <UsersTabs />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Last login</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-zinc-500">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="primary">{u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setResetUser(u)} title="Reset password">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreatePlatformUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => setResetUser(null)}
        />
      )}
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: { user: PlatformUser; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Password must be at least 8 characters.');
    if (next !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.patch(`/admin/platform-users/${user.id}`, { password: next });
      toast('Password reset', 'success');
      onDone();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {user.email}
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">New password (min 8 chars)</label>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Confirm password</label>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !next || !confirm}>
            {busy ? 'Resetting…' : 'Reset password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreatePlatformUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('support');
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/platform-users', { email, name, password, role });
      toast('Platform user created', 'success');
      onCreated();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Failed';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add platform user">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Temporary password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Combobox label="Role" options={PLATFORM_ROLE_OPTIONS} value={role} onChange={setRole} required />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}

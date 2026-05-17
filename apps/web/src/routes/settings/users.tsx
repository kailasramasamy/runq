import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
  ConfirmationDialog,
  TableSkeleton,
} from '@/components/ui';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from '@/hooks/queries/use-settings';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/components/ui';
import type { User, UserRole } from '@runq/types';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'accountant', label: 'Accountant' },
  // People Ops persona — tenant-wide HR read + full HR write, no Finance.
  { value: 'hr', label: 'HR' },
  { value: 'viewer', label: 'Viewer' },
];

function roleBadgeVariant(role: UserRole) {
  if (role === 'owner') return 'primary' as const;
  if (role === 'accountant') return 'info' as const;
  if (role === 'hr') return 'cyan' as const;
  return 'default' as const;
}

// ─── Invite Form ──────────────────────────────────────────────────────────────

function InviteForm({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ name, email, password, role });
      toast(`${name} invited successfully`, 'success');
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to invite user';
      toast(msg, 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Invite New User</h4>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Jane Smith"
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="jane@company.com"
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Min. 8 characters"
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          options={ROLE_OPTIONS}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:col-span-2">
          <Button type="submit" loading={create.isPending} size="sm">
            <Plus size={14} />
            Add User
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  isSelf,
  onDelete,
}: {
  user: User;
  isSelf: boolean;
  onDelete: (user: User) => void;
}) {
  const updateUser = useUpdateUser();
  const { toast } = useToast();

  async function handleRoleChange(newRole: string) {
    try {
      await updateUser.mutateAsync({ id: user.id, data: { role: newRole as UserRole } });
      toast('Role updated', 'success');
    } catch {
      toast('Failed to update role', 'error');
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{user.name}</p>
          {isSelf && (
            <span className="text-xs text-indigo-500 dark:text-indigo-400">You</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{user.email}</TableCell>
      <TableCell>
        {isSelf ? (
          <Badge variant={roleBadgeVariant(user.role)}>{user.role}</Badge>
        ) : (
          <select
            value={user.role}
            onChange={(e) => handleRoleChange(e.target.value)}
            disabled={updateUser.isPending}
            className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={user.isActive ? 'success' : 'default'}>
          {user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell align="right">
        <Button
          variant="ghost"
          size="sm"
          disabled={isSelf}
          onClick={() => onDelete(user)}
          title={isSelf ? 'Cannot delete yourself' : `Remove ${user.name}`}
          className={
            isSelf
              ? 'opacity-30'
              : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
          }
        >
          <Trash2 size={14} />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Users Page ───────────────────────────────────────────────────────────────

export function UsersPage() {
  const { data, isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [showInvite, setShowInvite] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      toast(`${deleteTarget.name} removed`, 'success');
    } catch {
      toast('Failed to remove user', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  const users = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Users"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Users' }]}
        description="Manage who has access to your workspace."
        actions={
          <Button size="sm" onClick={() => setShowInvite((v) => !v)}>
            <Plus size={14} />
            Invite User
          </Button>
        }
      />

      {showInvite && <InviteForm onClose={() => setShowInvite(false)} />}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900 text-sm text-zinc-500 text-center">
            No users yet. Invite one above.
          </div>
        ) : (
          users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div key={u.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {u.name}
                      {isSelf && <span className="ml-1 text-xs text-indigo-500 dark:text-indigo-400">(You)</span>}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    <Badge variant={u.isActive ? 'success' : 'default'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                {!isSelf && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(u)}
                      className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={5} />
              ) : users.length === 0 ? (
                <TableEmpty colSpan={5} message="No users yet. Invite one above." />
              ) : (
                users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUser?.id}
                    onDelete={setDeleteTarget}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Remove User"
        description={`Are you sure you want to remove ${deleteTarget?.name ?? 'this user'}? They will lose access immediately.`}
        confirmLabel="Remove"
        variant="danger"
        loading={deleteUser.isPending}
      />
    </div>
  );
}

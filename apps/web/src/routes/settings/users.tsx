import { useMemo, useState } from 'react';
import { Trash2, Search } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
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
import { useUsers, useUpdateUser, useDeleteUser, useEnabledModules, type TenantUser } from '@/hooks/queries/use-settings';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/components/ui';
import { AddEmployeeSection } from '@/components/settings/add-employee-section';
import { InviteUserSection } from '@/components/settings/invite-user-section';
import { TenantModulesCard, ModuleGrantEditor } from '@/components/settings/module-access';
import {
  assignableRoleOptions,
  isInlineEditableRole,
  roleBadgeVariant,
} from '@/components/settings/roles';

// Owner/accountant memberships are owner-managed only; an hr admin can't edit or
// remove them (mirrors the API escalation guard).
const PRIVILEGED_ROLES = new Set(['owner', 'client_owner', 'accountant']);
const isOwnerRole = (role?: string | null) => role === 'owner' || role === 'client_owner';
import type { UserRole, ModuleCode } from '@runq/types';

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  isSelf,
  actorRole,
  enabledModules,
  onDelete,
}: {
  user: TenantUser;
  isSelf: boolean;
  actorRole?: string;
  enabledModules: ModuleCode[];
  onDelete: (user: TenantUser) => void;
}) {
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  // A non-owner admin (hr) can't touch owner/accountant memberships.
  const canManage = !isSelf && (isOwnerRole(actorRole) || !PRIVILEGED_ROLES.has(user.role));

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
          {isSelf && <span className="text-xs text-indigo-500 dark:text-indigo-400">You</span>}
        </div>
      </TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{user.email}</TableCell>
      <TableCell>
        {canManage && isInlineEditableRole(user.role, actorRole) ? (
          <select
            value={user.role}
            onChange={(e) => handleRoleChange(e.target.value)}
            disabled={updateUser.isPending}
            className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {assignableRoleOptions(actorRole).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <Badge variant={roleBadgeVariant(user.role)}>{user.role}</Badge>
        )}
      </TableCell>
      <TableCell>
        <ModuleGrantEditor user={user} enabledModules={enabledModules} />
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
          disabled={!canManage}
          onClick={() => onDelete(user)}
          title={isSelf ? 'Cannot delete yourself' : canManage ? `Remove ${user.name}` : 'Only an owner can remove this user'}
          className={
            !canManage
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
  const { data: modulesData } = useEnabledModules();
  const deleteUser = useDeleteUser();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const enabledModules = modulesData?.data.enabledModules ?? [];
  const [deleteTarget, setDeleteTarget] = useState<TenantUser | null>(null);
  const [search, setSearch] = useState('');

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
  const query = search.trim().toLowerCase();
  const filteredUsers = useMemo(
    () =>
      query
        ? users.filter((u) =>
            [u.name, u.email, u.role].some((f) => f?.toLowerCase().includes(query)),
          )
        : users,
    [users, query],
  );

  return (
    <div>
      <PageHeader
        title="Users & access"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Users' }]}
        description="Manage who has access to your workspace and which modules they can use."
      />

      {/* Workspace-level module switches — the ceiling for every per-user grant. */}
      <div className="mb-4">
        <TenantModulesCard />
      </div>

      {/* Two ways in: turn an employee into a user, or invite someone by email. */}
      <AddEmployeeSection />
      <InviteUserSection />

      <div className="mb-2 mt-6 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Users</h3>
        {users.length > 0 && (
          <Input
            icon={<Search size={13} />}
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs"
          />
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
            />
          ))
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            {query ? 'No users match your search.' : 'No users yet. Add one above.'}
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isSelf = u.id === currentUser?.id;
            const canManage =
              !isSelf && (isOwnerRole(currentUser?.role) || !PRIVILEGED_ROLES.has(u.role));
            return (
              <div
                key={u.id}
                className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {u.name}
                      {isSelf && (
                        <span className="ml-1 text-xs text-indigo-500 dark:text-indigo-400">
                          (You)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-zinc-500">{u.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    <Badge variant={u.isActive ? 'success' : 'default'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500">Modules</span>
                  <ModuleGrantEditor user={u} enabledModules={enabledModules} />
                </div>
                {canManage && (
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
                <Th>Modules</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={6} />
              ) : filteredUsers.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  message={query ? 'No users match your search.' : 'No users yet. Add one above.'}
                />
              ) : (
                filteredUsers.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUser?.id}
                    actorRole={currentUser?.role}
                    enabledModules={enabledModules}
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

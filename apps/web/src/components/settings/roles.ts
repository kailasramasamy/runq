import type { UserRole } from '@runq/types';

// Roles selectable when creating a user directly (Add Employee as User).
export const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'accountant', label: 'Accountant' },
  // People Ops persona — tenant-wide HR read + full HR write, no Finance.
  { value: 'hr', label: 'HR' },
  // Shop-floor persona — Manufacturing + Inventory only, run production
  // (including unplanned Record Production runs), no Finance access.
  { value: 'technician', label: 'Technician — shop floor, run production, no finance access' },
  { value: 'viewer', label: 'Viewer' },
];

// An hr admin may provision staff but not mint owner/accountant logins — mirrors
// the API escalation guard. Owners get the full list.
export function assignableRoleOptions(actorRole: string | null | undefined) {
  if (actorRole === 'owner' || actorRole === 'client_owner') return ROLE_OPTIONS;
  return ROLE_OPTIONS.filter((o) => o.value === 'hr' || o.value === 'technician' || o.value === 'viewer');
}

// Roles offered on an email invite — the backend only accepts these two for
// join_tenant invites (createInviteSchema). Owner/HR/Technician are shop-floor
// or admin personas assigned directly (Add Employee as User), not via an
// external email invite link.
export const INVITE_ROLE_OPTIONS = [
  { value: 'accountant', label: 'Accountant — read & write' },
  { value: 'viewer', label: 'Viewer — read only' },
];

export function roleBadgeVariant(role: UserRole) {
  if (role === 'owner') return 'primary' as const;
  if (role === 'accountant') return 'info' as const;
  if (role === 'hr') return 'cyan' as const;
  if (role === 'technician') return 'warning' as const;
  return 'default' as const;
}

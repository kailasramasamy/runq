// `hr` = People Ops persona. Tenant-wide HR read + full HR write, but
// no Finance write. Added with mig 0084.
// `field_operator` (VMCC/CC/PP collection staff) and `farmer` are Dhenu
// milk-procurement personas: module-confined + row-scoped (mig 0132).
export type UserRole =
  | 'owner' | 'accountant' | 'viewer' | 'client_owner' | 'hr'
  | 'field_operator' | 'farmer';
export type PlatformRole = 'super_admin' | 'support' | 'billing_ops' | 'read_only';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  isActive: boolean;
}

export interface JWTPayload {
  userId: string;
  // tenantId is deprecated in JWT (Phase 1 multi-tenant). Kept optional for
  // backwards-compat with tokens issued before the rollout. Resolved per-request
  // from the X-Tenant-Id header against user_tenants membership.
  tenantId?: string;
  role: UserRole;
  platformRole?: PlatformRole;
  platformUserId?: string;
  impersonatedBy?: string;
}

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: UserRole;
}

export interface PlatformJWTPayload {
  platformUserId: string;
  platformRole: PlatformRole;
  email: string;
}

export interface ServiceJWTPayload {
  serviceId: string;
  tenantId: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'createdAt' | 'updatedAt'>;
}

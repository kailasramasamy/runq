export type UserRole = 'owner' | 'accountant' | 'viewer';
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
  tenantId: string;
  role: UserRole;
  platformRole?: PlatformRole;
  platformUserId?: string;
  impersonatedBy?: string;
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

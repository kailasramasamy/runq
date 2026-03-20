export type UserRole = 'owner' | 'accountant' | 'viewer';

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

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
}

export interface ServiceJWTPayload {
  serviceId: string;
  tenantId: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'createdAt' | 'updatedAt'>;
}

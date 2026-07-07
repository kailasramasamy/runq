import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { tenants, userTenants, userRoleEnum } from '@runq/db';
import { UnauthorizedError } from '../../utils/errors';
import { loadEnv } from '../../config/env';

const env = loadEnv();

export type UserRole = (typeof userRoleEnum.enumValues)[number];

// A stored date_of_birth → DDMMYY, the format the mobile client submits. Returns
// null when no DOB is on file. drizzle's `date` column comes back 'YYYY-MM-DD';
// tolerate a Date too.
export function dobToDDMMYY(dob: string | Date | null | undefined): string | null {
  if (!dob) return null;
  const iso = typeof dob === 'string' ? dob : dob.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return `${dd}${mm}${yyyy.slice(2)}`;
}

// The tenant-context plugin gates every protected request on a user_tenants row.
// `modules` stays null so effective access falls back to the role default
// (farmer/field_operator → milk_procurement only).
export async function ensureMembership(
  db: FastifyInstance['db'],
  userId: string,
  tenantId: string,
  role: UserRole,
): Promise<void> {
  const [existing] = await db
    .select({ id: userTenants.id })
    .from(userTenants)
    .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
    .limit(1);
  if (!existing) {
    await db.insert(userTenants).values({ userId, tenantId, role });
  }
}

// Final login step — issue the runq JWT + sanitised user. Shared across HR and
// Dhenu auth so the token shape is identical everywhere.
export async function issueSession(app: FastifyInstance, user: any) {
  if (!user.isActive) throw new UnauthorizedError('Account is disabled');
  await ensureMembership(app.db, user.id, user.tenantId, user.role);

  const [tenant] = await app.db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);
  if (!tenant) throw new UnauthorizedError('Tenant not found');

  const token = app.jwt.sign(
    { userId: user.id, tenantId: tenant.id, role: user.role },
    { expiresIn: env.JWT_EXPIRES_IN },
  );
  return {
    token,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  };
}

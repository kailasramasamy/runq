import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { tenants, userTenants, userRoleEnum } from '@runq/db';
import { UnauthorizedError, AppError } from '../../utils/errors';
import { getFirebaseAuth } from '../../utils/push/firebase-admin';
import { loadEnv } from '../../config/env';

const env = loadEnv();

export type UserRole = (typeof userRoleEnum.enumValues)[number];

// Verify a Firebase ID token. checkRevoked=true catches a stale token after an
// admin disables/resets the Firebase user — important for the reset-login flow.
// Shared by HR (`employees`) and Dhenu (`mp_credentials`) social auth.
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  const auth = getFirebaseAuth();
  if (!auth) throw new AppError(503, 'Firebase auth not configured', 'ConfigError');
  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    throw new UnauthorizedError('Invalid or expired sign-in token');
  }
}

// Which social provider minted this token. Bind/login only trust Google/Apple —
// never a bare phone or anonymous identity.
export function readSocialProvider(t: DecodedIdToken): 'google' | 'apple' | null {
  const ids = (t.firebase?.identities ?? {}) as Record<string, unknown>;
  if (Array.isArray(ids['google.com'])) return 'google';
  if (Array.isArray(ids['apple.com'])) return 'apple';
  return null;
}

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
